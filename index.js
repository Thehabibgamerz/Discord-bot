const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionsBitField
} = require("discord.js");

const cron = require("node-cron");
const fs = require("fs");

const TOKEN = process.env.TOKEN;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ================= DATABASE =================
if (!fs.existsSync("./database.json")) {
  fs.writeFileSync("./database.json", JSON.stringify({
    tickets: {},
    giveaways: {},
    events: {},
    routes: {},
    weeklyRoutes: {},
    routeSettings: { channelId: null, roleId: null }
  }, null, 2));
}

let db = JSON.parse(fs.readFileSync("./database.json"));
const saveDB = () =>
  fs.writeFileSync("./database.json", JSON.stringify(db, null, 2));

// ================= READY =================
client.once("clientReady", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const commands = [

    // SET ROUTE CHANNEL
    new SlashCommandBuilder()
      .setName("setroutechannel")
      .setDescription("Set channel for daily featured routes")
      .addChannelOption(o =>
        o.setName("channel")
          .setDescription("Select channel")
          .setRequired(true)),

    // SET ROUTE ROLE
    new SlashCommandBuilder()
      .setName("setrouterole")
      .setDescription("Set role to mention in route posts")
      .addRoleOption(o =>
        o.setName("role")
          .setDescription("Select role")
          .setRequired(true)),

    // SET SPECIFIC DATE ROUTES
    new SlashCommandBuilder()
      .setName("setroutes")
      .setDescription("Set routes for specific date")
      .addStringOption(o =>
        o.setName("date")
          .setDescription("YYYY-MM-DD")
          .setRequired(true))
      .addStringOption(o =>
        o.setName("multiplier")
          .setDescription("Example: 2x")
          .setRequired(true))
      .addStringOption(o =>
        o.setName("routes")
          .setDescription("Emoji | Flight No | Route (newline separated)")
          .setRequired(true)),

    // SET WEEKLY ROUTES
    new SlashCommandBuilder()
      .setName("setweeklyroutes")
      .setDescription("Set weekly template routes")
      .addStringOption(o =>
        o.setName("day")
          .setDescription("Day of week")
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
        o.setName("multiplier")
          .setDescription("Example: 1.5x")
          .setRequired(true))
      .addStringOption(o =>
        o.setName("routes")
          .setDescription("Emoji | Flight No | Route (newline separated)")
          .setRequired(true)),

    new SlashCommandBuilder()
      .setName("viewroutes")
      .setDescription("View all routes"),

    new SlashCommandBuilder()
      .setName("removeroutes")
      .setDescription("Remove specific date routes")
      .addStringOption(o =>
        o.setName("date")
          .setDescription("YYYY-MM-DD")
          .setRequired(true)),

    // ADMIN DASHBOARD
    new SlashCommandBuilder()
      .setName("routedashboard")
      .setDescription("View route system dashboard")
  ];

  await client.application.commands.set(commands);

  console.log("✅ Slash commands registered");

  // ================= MIDNIGHT UTC AUTO POST =================
  cron.schedule("0 0 * * *", async () => {

    const todayDate = new Date().toISOString().split("T")[0];
    const todayDay = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "UTC"
    });

    if (!db.routeSettings.channelId) return;

    const channel = await client.channels.fetch(db.routeSettings.channelId).catch(() => null);
    if (!channel) return;

    let data = db.routes[todayDate];

    if (!data && db.weeklyRoutes[todayDay]) {
      data = db.weeklyRoutes[todayDay];
    }

    if (!data) return;

    const embed = new EmbedBuilder()
      .setColor("Orange")
      .setTitle("🌟 Daily Featured Routes")
      .setDescription(
        `Featured routes for **${todayDate} (${todayDay})**\n\n` +
        `🔥 **${data.multiplier} Multiplier Available** on these routes!\n\n` +
        `${data.routes}`
      );

    channel.send({
      content: db.routeSettings.roleId
        ? `<@&${db.routeSettings.roleId}>`
        : null,
      embeds: [embed]
    });

  }, { timezone: "UTC" });

});

// ================= COMMAND HANDLER =================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === "setroutechannel") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: "Admin only.", ephemeral: true });

    db.routeSettings.channelId = interaction.options.getChannel("channel").id;
    saveDB();
    return interaction.reply("✅ Route channel set.");
  }

  if (commandName === "setrouterole") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: "Admin only.", ephemeral: true });

    db.routeSettings.roleId = interaction.options.getRole("role").id;
    saveDB();
    return interaction.reply("✅ Route role set.");
  }

  if (commandName === "setroutes") {
    db.routes[interaction.options.getString("date")] = {
      multiplier: interaction.options.getString("multiplier"),
      routes: interaction.options.getString("routes")
    };
    saveDB();
    return interaction.reply("✅ Date routes saved.");
  }

  if (commandName === "setweeklyroutes") {
    db.weeklyRoutes[interaction.options.getString("day")] = {
      multiplier: interaction.options.getString("multiplier"),
      routes: interaction.options.getString("routes")
    };
    saveDB();
    return interaction.reply("✅ Weekly template updated.");
  }

  if (commandName === "viewroutes") {
    return interaction.reply(
      `Weekly Routes: ${Object.keys(db.weeklyRoutes).length}\n` +
      `Specific Dates: ${Object.keys(db.routes).length}`
    );
  }

  if (commandName === "removeroutes") {
    const date = interaction.options.getString("date");
    delete db.routes[date];
    saveDB();
    return interaction.reply("❌ Date routes removed.");
  }

  if (commandName === "routedashboard") {

    const embed = new EmbedBuilder()
      .setColor("Orange")
      .setTitle("🛠 Route System Dashboard")
      .addFields(
        { name: "Route Channel", value: db.routeSettings.channelId ? `<#${db.routeSettings.channelId}>` : "Not Set" },
        { name: "Route Role", value: db.routeSettings.roleId ? `<@&${db.routeSettings.roleId}>` : "Not Set" },
        { name: "Weekly Templates", value: Object.keys(db.weeklyRoutes).length.toString(), inline: true },
        { name: "Specific Date Routes", value: Object.keys(db.routes).length.toString(), inline: true },
        { name: "Auto Post Time", value: "00:00 UTC Daily", inline: false }
      );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

});

client.login(TOKEN);
