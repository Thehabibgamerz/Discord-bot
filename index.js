const { 
  Client, 
  GatewayIntentBits, 
  PermissionsBitField,
  SlashCommandBuilder, 
  REST, 
  Routes,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType
} = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;

// Role IDs for ticket categories
const GENERAL_ROLE_ID = process.env.GENERAL_ROLE_ID;
const RECRUITER_ROLE_ID = process.env.RECRUITER_ROLE_ID;
const EXEC_ROLE_ID = process.env.EXEC_ROLE_ID;
const PIREP_ROLE_ID = process.env.PIREP_ROLE_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

/* ================= TICKET STORAGE ================= */
let ticketCounter = 0;
const activeTickets = new Map(); // userId -> channelId
const ticketData = new Map(); // channelId -> { category, openedBy, claimedBy }

/* ================= SLASH COMMANDS ================= */
const commands = [
  // ----- Old Commands -----
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),

  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Make the bot say something')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Message to send')
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Optional channel to send message')),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to kick')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to ban')
        .setRequired(true)),

  // ----- Ticket Commands -----
  new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Send the QPVA support ticket panel')
    .addChannelOption(opt => 
      opt.setName('channel')
        .setDescription('Where to send the panel')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('closeticket')
    .setDescription('Close the current ticket')
].map(cmd => cmd.toJSON());

/* ================= READY ================= */
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

/* ================= INTERACTION HANDLER ================= */
client.on('interactionCreate', async interaction => {
  try {
    // ----------------- Slash Commands -----------------
    if (interaction.isChatInputCommand()) {

      // ----- PING -----
      if (interaction.commandName === 'ping') {
        return interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);
      }

      // ----- SAY -----
      if (interaction.commandName === 'say') {
        const text = interaction.options.getString('text');
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        await channel.send(text);
        return interaction.reply({ content: `✅ Message sent to ${channel}`, ephemeral: true });
      }

      // ----- KICK -----
      if (interaction.commandName === 'kick') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers))
          return interaction.reply({ content: '❌ No permission.', ephemeral: true });

        const user = interaction.options.getUser('user');
        const member = interaction.guild.members.cache.get(user.id);
        if (member) {
          await member.kick();
          return interaction.reply(`👢 Kicked ${user.tag}`);
        }
      }

      // ----- BAN -----
      if (interaction.commandName === 'ban') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers))
          return interaction.reply({ content: '❌ No permission.', ephemeral: true });

        const user = interaction.options.getUser('user');
        const member = interaction.guild.members.cache.get(user.id);
        if (member) {
          await member.ban();
          return interaction.reply(`🔨 Banned ${user.tag}`);
        }
      }

      // ----- TICKET PANEL -----
      if (interaction.commandName === 'ticketpanel') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
          return interaction.reply({ content: "❌ Admin only.", ephemeral: true });

        const channel = interaction.options.getChannel('channel');

        const panelEmbed = new EmbedBuilder()
          .setTitle("🎫 QPVA Support Centre ✈️")
          .setDescription(
`Welcome to the Akasa Air Virtual Support Center!
Need assistance with any Akasa Air service? You’re in the right place! Our dedicated <@&${GENERAL_ROLE_ID}> is here to help you quickly and efficiently.

Please select a category below to create a ticket:

- General Support
- Recruitments
- Executive Team Support
- PIREP Support

We’re committed to making your journey with Akasa Air smooth and stress-free! 🌍✈️`
          )
          .setColor(0xff6600);

        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("ticket_select")
            .setPlaceholder("🎟 Select a support category")
            .addOptions([
              { label: "General Support", value: "general" },
              { label: "Recruitments", value: "recruit" },
              { label: "Executive Team Support", value: "exec" },
              { label: "PIREP Support", value: "pirep" }
            ])
        );

        await channel.send({ embeds: [panelEmbed], components: [row] });
        return interaction.reply({ content: "✅ Ticket panel sent.", ephemeral: true });
      }

      // ----- CLOSE TICKET -----
      if (interaction.commandName === 'closeticket') {
        const data = ticketData.get(interaction.channel.id);
        if (!data) return interaction.reply({ content: "❌ This is not a ticket channel.", ephemeral: true });

        ticketData.delete(interaction.channel.id);
        activeTickets.delete(data.openedBy);
        return interaction.channel.delete();
      }
    }

    // ----------------- Ticket Creation -----------------
    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_select") {

      if (activeTickets.has(interaction.user.id))
        return interaction.reply({ content: "❌ You already have an open ticket.", ephemeral: true });

      // ✅ Fix for "This interaction failed"
      await interaction.deferReply({ ephemeral: true });

      ticketCounter++;
      const ticketNumber = String(ticketCounter).padStart(3, "0");

      const categoryMap = {
        general: { name: "General Support", role: GENERAL_ROLE_ID },
        recruit: { name: "Recruitments", role: RECRUITER_ROLE_ID },
        exec: { name: "Executive Team Support", role: EXEC_ROLE_ID },
        pirep: { name: "PIREP Support", role: PIREP_ROLE_ID }
      };

      const selected = categoryMap[interaction.values[0]];

      const channel = await interaction.guild.channels.create({
        name: `ticket-${ticketNumber}`,
        type: ChannelType.GuildText,
        parent: CATEGORY_ID,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: selected.role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      activeTickets.set(interaction.user.id, channel.id);
      ticketData.set(channel.id, { category: selected.name, openedBy: interaction.user.id, claimedBy: null });

      const embed = new EmbedBuilder()
        .setTitle(selected.name)
        .setDescription(`Thanks for creating a ticket! Our staff team will contact you shortly.`)
        .addFields({ name: "Opened by", value: `<@${interaction.user.id}>` })
        .setColor(0x2ecc71);

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("claim").setLabel("Claim").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("adduser").setLabel("Add User").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("removeuser").setLabel("Remove User").setStyle(ButtonStyle.Secondary)
      );

      await channel.send({ content: `<@&${selected.role}>`, embeds: [embed], components: [buttons] });

      return interaction.editReply({ content: `🎟 Ticket created: ${channel}` });
    }

    // ----------------- Ticket Buttons -----------------
    if (interaction.isButton()) {
      const data = ticketData.get(interaction.channel.id);
      if (!data) return interaction.reply({ content: "❌ Not a ticket channel.", ephemeral: true });

      const memberRoles = interaction.member.roles.cache;
      const allowedRoles = [GENERAL_ROLE_ID, RECRUITER_ROLE_ID, EXEC_ROLE_ID, PIREP_ROLE_ID];
      const isStaff = memberRoles.some(r => allowedRoles.includes(r.id));
      if (!isStaff) return interaction.reply({ content: "❌ Only staff can use this.", ephemeral: true });

      if (interaction.customId === "claim") {
        data.claimedBy = interaction.user.id;
        await interaction.channel.setName(`claimed-${interaction.channel.name}`);
        return interaction.update({ content: "✅ Ticket claimed.", components: [] });
      }

      if (interaction.customId === "adduser") {
        await interaction.channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: true, SendMessages: true });
        return interaction.reply({ content: `✅ You were added to the ticket.`, ephemeral: true });
      }

      if (interaction.customId === "removeuser") {
        await interaction.channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: false, SendMessages: false });
        return interaction.reply({ content: `✅ You were removed from the ticket.`, ephemeral: true });
      }
    }

  } catch (err) {
    console.error(err);
  }
});

/* ================= REGISTER COMMANDS ================= */
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
  console.log("✅ Slash commands registered");
}

registerCommands();
client.login(TOKEN);
