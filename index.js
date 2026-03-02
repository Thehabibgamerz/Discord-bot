const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const express = require('express');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PORT = process.env.PORT || 3000;

/* ================= DISCORD CLIENT ================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* ================= SLASH COMMANDS ================= */

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency')
].map(cmd => cmd.toJSON());

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

/* ================= INTERACTIONS ================= */

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);
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

/* ================= WEB DASHBOARD ================= */

const app = express();

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Bot Dashboard</title>
        <style>
          body {
            font-family: Arial;
            background: #0f172a;
            color: white;
            text-align: center;
            padding-top: 50px;
          }
          .card {
            background: #1e293b;
            padding: 30px;
            border-radius: 10px;
            display: inline-block;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🤖 ${client.user ? client.user.username : "Bot"}</h1>
          <p>Status: 🟢 Online</p>
          <p>Servers: ${client.guilds.cache.size}</p>
          <p>Ping: ${client.ws.ping}ms</p>
        </div>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🌐 Dashboard running on port ${PORT}`);
});    .setDescription('Kick a member')
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

/* ================= COMMAND HANDLER ================= */

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

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
