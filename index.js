const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  AttachmentBuilder
} = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;
const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const PANEL_IMAGE_URL = process.env.PANEL_IMAGE_URL;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

/* ================= TICKET DATA ================= */

let ticketCounter = 0;
const activeTickets = new Map(); // userId -> channelId
const ticketData = new Map(); // channelId -> data

/* ================= SLASH COMMANDS ================= */

const commands = [

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),

  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Make the bot say something')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Message to send')
        .setRequired(true)),

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

  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Send support ticket panel')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to send panel')
        .setRequired(true))

].map(cmd => cmd.toJSON());

/* ================= READY ================= */

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

/* ================= WELCOME SYSTEM ================= */

client.on('guildMemberAdd', member => {
  const channel = member.guild.systemChannel;
  if (channel) {
    channel.send(`🎉 Welcome ${member.user} to **${member.guild.name}**!`);
  }
});

/* ================= INTERACTION HANDLER ================= */

client.on('interactionCreate', async interaction => {

try {

if (!interaction.isChatInputCommand() && !interaction.isStringSelectMenu() && !interaction.isButton()) return;

/* ===== NORMAL COMMANDS ===== */

if (interaction.isChatInputCommand()) {

  if (interaction.commandName === 'ping') {
    return interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);
  }

  if (interaction.commandName === 'say') {
    const text = interaction.options.getString('text');
    return interaction.reply(text);
  }

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

  /* ===== PANEL COMMAND ===== */

  if (interaction.commandName === 'panel') {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });

    const channel = interaction.options.getChannel('channel');

    const embed = new EmbedBuilder()
      .setTitle("Akasa Air Virtual Support Center ✈️")
      .setDescription(
`Welcome to the Akasa Air Virtual Support Center! ✈️
Need assistance with Akasa Air services? You’re in the right place! Our dedicated <@&${SUPPORT_ROLE_ID}> is available to help you quickly and efficiently.

Please select a category below to get started, and we’ll connect you with the right support right away.

We’re here to make your journey with Akasa Air smooth and stress-free! 🌍✈️`
      )
      .setColor(0xff6600);

    if (PANEL_IMAGE_URL) embed.setImage(PANEL_IMAGE_URL);

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("ticket_select")
        .setPlaceholder("🎟 Select a support category")
        .addOptions([
          { label: "General Support", value: "general" },
          { label: "Recruitments", value: "recruit" },
          { label: "PIREP Support", value: "pirep" },
          { label: "Executive Team Support", value: "executive" },
          { label: "Routes Support", value: "routes" }
        ])
    );

    await channel.send({ embeds: [embed], components: [row] });

    return interaction.reply({ content: "✅ Panel sent.", ephemeral: true });
  }

}

/* ===== CREATE TICKET ===== */

if (interaction.isStringSelectMenu()) {

  if (activeTickets.has(interaction.user.id))
    return interaction.reply({ content: "❌ You already have an open ticket.", ephemeral: true });

  ticketCounter++;
  const ticketNumber = String(ticketCounter).padStart(3, "0");

  const categoryMap = {
    general: "General Support",
    recruit: "Recruitments",
    pirep: "PIREP Support",
    executive: "Executive Team Support",
    routes: "Routes Support"
  };

  const selected = categoryMap[interaction.values[0]];

  const channel = await interaction.guild.channels.create({
    name: `ticket-${ticketNumber}`,
    type: ChannelType.GuildText,
    parent: CATEGORY_ID,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: SUPPORT_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
    ]
  });

  activeTickets.set(interaction.user.id, channel.id);
  ticketData.set(channel.id, {
    number: ticketNumber,
    openedBy: interaction.user.id,
    claimedBy: null
  });

  const embed = new EmbedBuilder()
    .setTitle(selected)
    .setDescription("Our staff team will contact you shortly!")
    .addFields(
      { name: "Opened by", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Claimed by", value: "Not claimed", inline: true }
    )
    .setColor(0x2ecc71);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("claim").setLabel("Claim").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("close").setLabel("Close").setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `<@&${SUPPORT_ROLE_ID}>`,
    embeds: [embed],
    components: [buttons]
  });

  return interaction.reply({ content: `🎟 Ticket created: ${channel}`, ephemeral: true });
}

/* ===== BUTTONS ===== */

if (interaction.isButton()) {

  const data = ticketData.get(interaction.channel.id);
  if (!data) return;

  if (!interaction.member.roles.cache.has(SUPPORT_ROLE_ID))
    return interaction.reply({ content: "Staff only.", ephemeral: true });

  if (interaction.customId === "claim") {

    data.claimedBy = interaction.user.id;
    await interaction.channel.setName(`claimed-${data.number}`);

    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("Ticket Claimed")
          .addFields(
            { name: "Opened by", value: `<@${data.openedBy}>`, inline: true },
            { name: "Claimed by", value: `<@${interaction.user.id}>`, inline: true }
          )
          .setColor(0x3498db)
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("close").setLabel("Close").setStyle(ButtonStyle.Danger)
        )
      ]
    });
  }

  if (interaction.customId === "close") {

    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    const sorted = Array.from(messages.values()).reverse();

    let transcript = `Ticket #${data.number}\n\n`;

    for (const msg of sorted) {
      transcript += `[${msg.author.tag}] ${msg.content}\n`;
    }

    const file = new AttachmentBuilder(
      Buffer.from(transcript, "utf-8"),
      { name: `ticket-${data.number}.txt` }
    );

    const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);

    if (logChannel) {
      await logChannel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Ticket Closed")
            .addFields(
              { name: "Ticket", value: `ticket-${data.number}` },
              { name: "Opened By", value: `<@${data.openedBy}>` },
              { name: "Closed By", value: `<@${interaction.user.id}>` }
            )
            .setColor(0xff0000)
        ],
        files: [file]
      });
    }

    activeTickets.delete(data.openedBy);
    ticketData.delete(interaction.channel.id);

    return interaction.channel.delete();
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
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );
  console.log("✅ Slash commands registered");
}

registerCommands();

client.login(TOKEN);
