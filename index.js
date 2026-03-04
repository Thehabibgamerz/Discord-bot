const {
  Client, GatewayIntentBits, PermissionsBitField,
  REST, Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActivityType
} = require('discord.js');

const cron = require('node-cron');
const Database = require('better-sqlite3');

/* ================= ENV ================= */

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const OWNER_ID = process.env.OWNER_ID;

const FEATURED_ROLE_ID = process.env.FEATURED_ROLE_ID;
const FEATURED_CHANNEL_ID = process.env.FEATURED_CHANNEL_ID;

const IF_API_KEY = process.env.IF_API_KEY;

/* ================= CLIENT ================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

/* ================= DATABASE ================= */

const db = new Database('./database.sqlite');

db.prepare(`
  CREATE TABLE IF NOT EXISTS featured_routes (
    day TEXT PRIMARY KEY,
    multiplier TEXT,
    routes TEXT
  )
`).run();

/* ================= HELPERS ================= */

function formatDateUTC(date) {
  return date.toLocaleString("en-US", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

/* ================= SLASH COMMANDS ================= */

const commands = [

  new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Set bot status')
    .addStringOption(o => o.setName('type').setDescription('PLAYING/WATCHING/LISTENING').setRequired(true))
    .addStringOption(o => o.setName('text').setDescription('Status text').setRequired(true)),

  new SlashCommandBuilder()
    .setName('atis')
    .setDescription('Get Infinite Flight ATIS')
    .addStringOption(o => o.setName('icao').setDescription('Airport ICAO').setRequired(true))
    .addStringOption(o => o.setName('server').setDescription('casual/training/expert').setRequired(true)),

  /* ================= SET ROUTES ================= */

  new SlashCommandBuilder()
    .setName('setroutes')
    .setDescription('Set featured routes for a day')
    .addStringOption(o =>
      o.setName('day')
        .setDescription('Day of week')
        .setRequired(true)
        .addChoices(
          { name: "Monday", value: "Monday" },
          { name: "Tuesday", value: "Tuesday" },
          { name: "Wednesday", value: "Wednesday" },
          { name: "Thursday", value: "Thursday" },
          { name: "Friday", value: "Friday" },
          { name: "Saturday", value: "Saturday" },
          { name: "Sunday", value: "Sunday" }
        ))
    .addStringOption(o =>
      o.setName('multiplier')
        .setDescription('Example: 1.7x')
        .setRequired(true))
    .addStringOption(o =>
      o.setName('routes')
        .setDescription('Separate routes with | Example: VABB-OMDB | VIDP-EGLL')
        .setRequired(true)),

  /* ================= VIEW ROUTES ================= */

  new SlashCommandBuilder()
    .setName('viewroutes')
    .setDescription('View featured routes')
    .addStringOption(o =>
      o.setName('day')
        .setDescription('Optional specific day')
        .setRequired(false)
        .addChoices(
          { name: "Monday", value: "Monday" },
          { name: "Tuesday", value: "Tuesday" },
          { name: "Wednesday", value: "Wednesday" },
          { name: "Thursday", value: "Thursday" },
          { name: "Friday", value: "Friday" },
          { name: "Saturday", value: "Saturday" },
          { name: "Sunday", value: "Sunday" }
        )),

  /* ================= REMOVE ROUTES ================= */

  new SlashCommandBuilder()
    .setName('removeroutes')
    .setDescription('Remove featured routes for a day')
    .addStringOption(o =>
      o.setName('day')
        .setDescription('Day of week')
        .setRequired(true)
        .addChoices(
          { name: "Monday", value: "Monday" },
          { name: "Tuesday", value: "Tuesday" },
          { name: "Wednesday", value: "Wednesday" },
          { name: "Thursday", value: "Thursday" },
          { name: "Friday", value: "Friday" },
          { name: "Saturday", value: "Saturday" },
          { name: "Sunday", value: "Sunday" }
        ))

].map(c => c.toJSON());

/* ================= REGISTER ================= */

(async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
  console.log("✅ Commands Registered");
})();

/* ================= READY ================= */

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

/* ================= INTERACTIONS ================= */

client.on('interactionCreate', async interaction => {

  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;

  /* ===== PING ===== */

  if (cmd === 'ping')
    return interaction.reply(`🏓 Pong: ${client.ws.ping}ms`);

  /* ===== STATUS ===== */

  if (cmd === 'status') {
    if (interaction.user.id !== OWNER_ID)
      return interaction.reply({ content: 'Owner only.', ephemeral: true });

    const type = interaction.options.getString('type').toUpperCase();
    const text = interaction.options.getString('text');

    let activityType = ActivityType.Playing;
    if (type === "WATCHING") activityType = ActivityType.Watching;
    if (type === "LISTENING") activityType = ActivityType.Listening;

    client.user.setActivity(text, { type: activityType });

    return interaction.reply({ content: '✅ Status Updated', ephemeral: true });
  }

  /* ===== ATIS ===== */

  if (cmd === 'atis') {

    const icao = interaction.options.getString('icao').toUpperCase();
    const server = interaction.options.getString('server').toLowerCase();

    await interaction.deferReply();

    try {
      const res = await fetch(`https://api.infiniteflight.com/public/v2/atis/${icao}?server=${server}`, {
        headers: { Authorization: `Bearer ${IF_API_KEY}` }
      });

      if (!res.ok)
        return interaction.editReply('❌ No ATIS available.');

      const data = await res.json();

      const embed = new EmbedBuilder()
        .setTitle(`ATIS - ${icao} (${server})`)
        .setDescription(data.atis || "No data")
        .setColor(0x1E90FF)
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });

    } catch {
      return interaction.editReply('❌ Failed to fetch ATIS.');
    }
  }

  /* ===== SET ROUTES ===== */

  if (cmd === 'setroutes') {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'Admin only.', ephemeral: true });

    const day = interaction.options.getString('day');
    const multiplier = interaction.options.getString('multiplier');
    const routes = interaction.options.getString('routes')
      .split('|')
      .map(r => r.trim());

    db.prepare(`
      INSERT INTO featured_routes (day, multiplier, routes)
      VALUES (?, ?, ?)
      ON CONFLICT(day)
      DO UPDATE SET multiplier=excluded.multiplier, routes=excluded.routes
    `).run(day, multiplier, JSON.stringify(routes));

    return interaction.reply({ content: `✅ Routes saved for ${day}`, ephemeral: true });
  }

  /* ===== VIEW ROUTES ===== */

  if (cmd === 'viewroutes') {

    const day = interaction.options.getString('day');

    if (day) {
      const row = db.prepare("SELECT * FROM featured_routes WHERE day=?").get(day);
      if (!row)
        return interaction.reply({ content: 'No routes set for that day.', ephemeral: true });

      const routes = JSON.parse(row.routes);

      const embed = new EmbedBuilder()
        .setTitle(`📅 ${day} Featured Routes`)
        .setDescription(
          `**Multiplier:** ${row.multiplier}\n\n` +
          routes.map(r => `• ${r}`).join('\n')
        )
        .setColor(0x00AEFF);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const all = db.prepare("SELECT * FROM featured_routes").all();
    if (!all.length)
      return interaction.reply({ content: 'No routes saved yet.', ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle("📅 All Featured Routes")
      .setColor(0x00AEFF);

    all.forEach(row => {
      embed.addFields({
        name: `${row.day} (${row.multiplier})`,
        value: JSON.parse(row.routes).map(r => `• ${r}`).join('\n')
      });
    });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  /* ===== REMOVE ROUTES ===== */

  if (cmd === 'removeroutes') {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'Admin only.', ephemeral: true });

    const day = interaction.options.getString('day');

    db.prepare("DELETE FROM featured_routes WHERE day=?").run(day);

    return interaction.reply({ content: `🗑 Removed routes for ${day}`, ephemeral: true });
  }

});

/* ================= DAILY AUTO POST ================= */

async function sendDailyFeaturedRoutes() {

  const channel = await client.channels.fetch(FEATURED_CHANNEL_ID);
  if (!channel) return;

  const now = new Date();
  const day = now.toLocaleString("en-US", { weekday: "long", timeZone: "UTC" });

  const row = db.prepare("SELECT * FROM featured_routes WHERE day=?").get(day);
  if (!row) return;

  const routes = JSON.parse(row.routes);

  const embed = new EmbedBuilder()
    .setTitle("🌟 Daily Featured Routes")
    .setDescription(
      `${formatDateUTC(now)}\n\n` +
      `**Multiplier:** ${row.multiplier}\n\n` +
      `✈️ **Routes:**\n` +
      routes.map(r => `• ${r}`).join('\n')
    )
    .setColor(0xff9900)
    .setTimestamp();

  await channel.send({
    content: `<@&${FEATURED_ROLE_ID}>`,
    embeds: [embed]
  });

  console.log(`✅ Featured routes sent for ${day}`);
}

cron.schedule("0 0 * * *", () => {
  sendDailyFeaturedRoutes();
}, { timezone: "UTC" });

client.login(TOKEN);
