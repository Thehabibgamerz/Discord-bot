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

  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Send support ticket panel')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to send panel')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Set bot status')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Status type')
        .setRequired(true)
        .addChoices(
          { name: 'Playing', value: 'PLAYING' },
          { name: 'Watching', value: 'WATCHING' },
          { name: 'Listening', value: 'LISTENING' },
          { name: 'Streaming', value: 'STREAMING' }
        ))
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Status text')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('role')
    .setDescription('Add or remove a role from a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Target user')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('Role to add/remove')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('action')
        .setDescription('Add or remove role')
        .setRequired(true)
        .addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' }
        ))
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

  // PING
  if (interaction.commandName === 'ping') {
    return interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);
  }

  // SAY
  if (interaction.commandName === 'say') {
    const text = interaction.options.getString('text');
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    await channel.send(text);
    return interaction.reply({ content: `✅ Message sent to ${channel}`, ephemeral: true });
  }

  // KICK
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

  // BAN
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

  // PANEL
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

  // STATUS
  if (interaction.commandName === 'status') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });

    const type = interaction.options.getString('type');
    const text = interaction.options.getString('text');

    let activityType = 0; // default playing
    if (type === 'WATCHING') activityType = 3;
    if (type === 'LISTENING') activityType = 2;
    if (type === 'STREAMING') activityType = 1;

    await client.user.setActivity(text, { type: activityType, url: type === 'STREAMING' ? 'https://twitch.tv/discord' : undefined });
    return interaction.reply({ content: `✅ Status set to ${type} ${text}`, ephemeral: true });
  }

  // ROLE ADD/REMOVE
  if (interaction.commandName === 'role') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });

    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const action = interaction.options.getString('action');

    const member = interaction.guild.members.cache.get(user.id);

    if (!member) return interaction.reply({ content: '❌ User not found.', ephemeral: true });

    if (action === 'add') {
      await member.roles.add(role);
      return interaction.reply({ embeds: [
        new EmbedBuilder()
          .setDescription(`✅ Added role <@&${role.id}> to <@${user.id}>`)
          .setColor(0x2ecc71)
      ]});
    } else {
      await member.roles.remove(role);
      return interaction.reply({ embeds: [
        new EmbedBuilder()
          .setDescription(`✅ Removed role <@&${role.id}> from <@${user.id}>`)
          .setColor(0xe74c3c)
      ]});
    }
  }

}

/* ===== TICKET INTERACTIONS ===== */
// (Ticket creation, claim, close remain exactly as in your previous advanced ticket system)
// Copy your ticket system from previous code here without changes
// Ensure ticketCounter, activeTickets, ticketData are used exactly as above

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
