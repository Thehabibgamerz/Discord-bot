const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  ChannelType,
  PermissionsBitField
} = require("discord.js");

const cron = require("node-cron");
const fs = require("fs");

// ================= CONFIG =================
const TOKEN = process.env.TOKEN;
const ROUTE_ROLE = "YOUR_ROUTE_ROLE_ID";

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

// ================= DATABASE =================
if (!fs.existsSync("./database.json")) {
  fs.writeFileSync("./database.json", JSON.stringify({
    tickets: {},
    giveaways: {},
    events: {},
    routes: {}
  }, null, 2));
}

let db = JSON.parse(fs.readFileSync("./database.json"));
const saveDB = () =>
  fs.writeFileSync("./database.json", JSON.stringify(db, null, 2));

// ================= READY =================
client.once("clientReady", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const commands = [

    // ===== FEATURED ROUTES (UPGRADED) =====
    new SlashCommandBuilder()
      .setName("setroutes")
      .setDescription("Set daily featured routes")
      .addStringOption(o =>
        o.setName("date")
          .setDescription("Date in format YYYY-MM-DD")
          .setRequired(true))
      .addStringOption(o =>
        o.setName("multiplier")
          .setDescription("Multiplier (example: 2x)")
          .setRequired(true))
      .addStringOption(o =>
        o.setName("routes")
          .setDescription("Routes format: emoji | flight number | route (separate by new line)")
          .setRequired(true)),

    new SlashCommandBuilder()
      .setName("viewroutes")
      .setDescription("View all scheduled routes"),

    new SlashCommandBuilder()
      .setName("removeroutes")
      .setDescription("Remove routes for a date")
      .addStringOption(o =>
        o.setName("date")
          .setDescription("Date YYYY-MM-DD")
          .setRequired(true))
  ];

  await client.application.commands.set(commands);
  console.log("✅ Slash commands registered");

  // ===== MIDNIGHT UTC AUTO POST =====
  cron.schedule("0 0 * * *", () => {

    const today = new Date().toISOString().split("T")[0];

    if (!db.routes[today]) return;

    const data = db.routes[today];

    const embed = new EmbedBuilder()
      .setColor("Orange")
      .setTitle("🌟 Daily Featured Routes")
      .setDescription(
        `Featured routes for **${today}**\n\n` +
        `🔥 **${data.multiplier} Multiplier Available** on these routes!\n\n` +
        `${data.routes}`
      );

    client.guilds.cache.forEach(guild => {
      const channel = guild.systemChannel;
      if (channel) {
        channel.send({
          content: `<@&${ROUTE_ROLE}>`,
          embeds: [embed]
        });
      }
    });
  });
});

// ================= COMMAND HANDLER =================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // ===== SET ROUTES =====
  if (commandName === "setroutes") {
    const date = interaction.options.getString("date");
    const multiplier = interaction.options.getString("multiplier");
    const routes = interaction.options.getString("routes");

    db.routes[date] = { multiplier, routes };
    saveDB();

    const embed = new EmbedBuilder()
      .setColor("Orange")
      .setTitle("🌟 Daily Featured Routes")
      .setDescription(
        `Featured routes for **${date}**\n\n` +
        `🔥 **${multiplier} Multiplier Available** on these routes!\n\n` +
        `${routes}`
      );

    return interaction.reply({ embeds: [embed] });
  }

  // ===== VIEW ROUTES =====
  if (commandName === "viewroutes") {
    if (!Object.keys(db.routes).length)
      return interaction.reply("No routes scheduled.");

    const formatted = Object.entries(db.routes)
      .map(([date, data]) =>
        `📅 **${date}**\n🔥 ${data.multiplier}\n${data.routes}`
      )
      .join("\n\n");

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Orange")
          .setTitle("🌟 Scheduled Featured Routes")
          .setDescription(formatted)
      ]
    });
  }

  // ===== REMOVE ROUTES =====
  if (commandName === "removeroutes") {
    const date = interaction.options.getString("date");

    if (!db.routes[date])
      return interaction.reply("No routes found for that date.");

    delete db.routes[date];
    saveDB();

    return interaction.reply(`❌ Removed routes for ${date}`);
  }
});

client.login(TOKEN);
