const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  REST,
  Routes,
  ActivityType,
  ChannelType
} = require("discord.js");

const fs = require("fs");
const cron = require("node-cron");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;
const TICKET_LOG_CHANNEL_ID = process.env.TICKET_LOG_CHANNEL_ID;
const OWNER_ID = process.env.OWNER_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.log("❌ Missing environment variables!");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages]
});

// ================= DATABASE =================
if (!fs.existsSync("./database.json")) {
  fs.writeFileSync(
    "./database.json",
    JSON.stringify({
      tickets: {},
      routes: {},
      weeklyRoutes: {},
      routeSettings: { channelId: null, roleId: null },
      giveaways: {}
    }, null, 2)
  );
}
let db = JSON.parse(fs.readFileSync("./database.json"));
const saveDB = () => fs.writeFileSync("./database.json", JSON.stringify(db, null, 2));

// ================= COMMANDS =================
const commands = [
  // Classic admin commands
  new SlashCommandBuilder().setName("ping").setDescription("Check bot latency"),
  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Make the bot say something")
    .addStringOption(o => o.setName("text").setDescription("Message to send").setRequired(true))
    .addChannelOption(o => o.setName("channel").setDescription("Channel to send in")),
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member")
    .addUserOption(o => o.setName("user").setDescription("User to kick").setRequired(true)),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member")
    .addUserOption(o => o.setName("user").setDescription("User to ban").setRequired(true)),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Set bot status (owner only)")
    .addStringOption(o =>
      o.setName("type")
        .setDescription("Status type")
        .setRequired(true)
        .addChoices(
          { name: "Playing", value: "PLAYING" },
          { name: "Watching", value: "WATCHING" },
          { name: "Listening", value: "LISTENING" },
          { name: "Streaming", value: "STREAMING" }
        ))
    .addStringOption(o => o.setName("text").setDescription("Status text").setRequired(true)),

  // Ticket panel
  new SlashCommandBuilder().setName("ticketpanel").setDescription("Send the support ticket panel"),

  // Featured Routes commands
  new SlashCommandBuilder()
    .setName("setroutechannel")
    .setDescription("Set channel for daily featured routes")
    .addChannelOption(o => o.setName("channel").setDescription("Select channel").setRequired(true)),
  new SlashCommandBuilder()
    .setName("setrouterole")
    .setDescription("Set role to mention in route posts")
    .addRoleOption(o => o.setName("role").setDescription("Select role").setRequired(true)),
  new SlashCommandBuilder()
    .setName("setroutes")
    .setDescription("Set routes for a specific date")
    .addStringOption(o => o.setName("date").setDescription("YYYY-MM-DD").setRequired(true))
    .addStringOption(o => o.setName("multiplier").setDescription("Example: 2x").setRequired(true))
    .addStringOption(o => o.setName("routes").setDescription("Emoji | Flight No | Route (newline)").setRequired(true)),
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
    .addStringOption(o => o.setName("multiplier").setDescription("Example: 1.5x").setRequired(true))
    .addStringOption(o => o.setName("routes").setDescription("Emoji | Flight No | Route (newline)").setRequired(true)),
  new SlashCommandBuilder().setName("viewroutes").setDescription("View all routes"),
  new SlashCommandBuilder()
    .setName("removeroutes")
    .setDescription("Remove specific date routes")
    .addStringOption(o => o.setName("date").setDescription("YYYY-MM-DD").setRequired(true)),
].map(cmd => cmd.toJSON());

// ================= REGISTER COMMANDS =================
(async () => {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    console.log("🛠 Registering slash commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Commands registered");
  } catch (err) {
    console.error(err);
  }
})();

// ================= CLIENT READY =================
client.once("clientReady", () => console.log(`🤖 Logged in as ${client.user.tag}`));

// ================= INTERACTION HANDLER =================
client.on("interactionCreate", async interaction => {
  if (interaction.isChatInputCommand()) {

    // ---- PING ----
    if (interaction.commandName === "ping") {
      return interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);
    }

    // ---- SAY ----
    if (interaction.commandName === "say") {
      const text = interaction.options.getString("text");
      const channel = interaction.options.getChannel("channel") || interaction.channel;
      return channel.send({ content: text }).then(() => interaction.reply({ content: "✅ Message sent", ephemeral: true }));
    }

    // ---- KICK ----
    if (interaction.commandName === "kick") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers))
        return interaction.reply({ content: "❌ No permission.", ephemeral: true });
      const user = interaction.options.getUser("user");
      const member = interaction.guild.members.cache.get(user.id);
      if (member) {
        await member.kick();
        return interaction.reply(`👢 Kicked ${user.tag}`);
      }
    }

    // ---- BAN ----
    if (interaction.commandName === "ban") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers))
        return interaction.reply({ content: "❌ No permission.", ephemeral: true });
      const user = interaction.options.getUser("user");
      const member = interaction.guild.members.cache.get(user.id);
      if (member) {
        await member.ban();
        return interaction.reply(`🔨 Banned ${user.tag}`);
      }
    }

    // ---- STATUS ----
    if (interaction.commandName === "status") {
      if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: "❌ Owner only", ephemeral: true });
      const type = interaction.options.getString("type");
      const text = interaction.options.getString("text");
      let activityType = ActivityType.Playing;
      if (type === "WATCHING") activityType = ActivityType.Watching;
      if (type === "LISTENING") activityType = ActivityType.Listening;
      if (type === "STREAMING") activityType = ActivityType.Streaming;
      client.user.setActivity(text, { type: activityType, url: type === "STREAMING" ? "https://twitch.tv/discord" : undefined });
      return interaction.reply({ content: `✅ Status updated: ${type} ${text}`, ephemeral: true });
    }

    // ---- TICKET PANEL ----
    if (interaction.commandName === "ticketpanel") {
      const embed = new EmbedBuilder()
        .setTitle("🎫 QPVA Support Centre ✈️")
        .setDescription(
          `Welcome to the Akasa Air Virtual Support Center! ✈️\n\n` +
          `Need assistance with any Akasa Air service? You’re in the right place! Our dedicated <@&${SUPPORT_ROLE_ID}> is here to help you quickly and efficiently.\n\n` +
          `Please select a category below to create a ticket:\n\n` +
          `- General Support\n- Recruitments\n- Executive Team Support\n- PIREP Support\n\n` +
          `We’re committed to making your journey with Akasa Air smooth and stress-free! 🌍✈️`
        )
        .setColor(0x00FF00);

      const createBtn = new ButtonBuilder().setCustomId("create_ticket").setLabel("📩 Create Ticket").setStyle(ButtonStyle.Primary);
      const row = new ActionRowBuilder().addComponents(createBtn);

      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: "✅ Ticket panel sent", ephemeral: true });
    }

    // ---- FEATURED ROUTES ----
    // Handled later in cron and /setroutes commands
    if (interaction.commandName === "setroutechannel") {
      const channel = interaction.options.getChannel("channel");
      db.routeSettings.channelId = channel.id;
      saveDB();
      return interaction.reply({ content: `✅ Featured routes channel set to ${channel}`, ephemeral: true });
    }

    if (interaction.commandName === "setrouterole") {
      const role = interaction.options.getRole("role");
      db.routeSettings.roleId = role.id;
      saveDB();
      return interaction.reply({ content: `✅ Route mention role set to ${role}`, ephemeral: true });
    }

    if (interaction.commandName === "setroutes") {
      const date = interaction.options.getString("date");
      const multiplier = interaction.options.getString("multiplier");
      const routes = interaction.options.getString("routes");
      db.routes[date] = { multiplier, routes };
      saveDB();
      return interaction.reply({ content: `✅ Routes set for ${date}`, ephemeral: true });
    }

    if (interaction.commandName === "viewroutes") {
      let message = "";
      for (const date in db.routes) {
        message += `**${date}**: ${db.routes[date].routes} (${db.routes[date].multiplier})\n\n`;
      }
      return interaction.reply({ content: message || "No routes set.", ephemeral: true });
    }

    if (interaction.commandName === "removeroutes") {
      const date = interaction.options.getString("date");
      delete db.routes[date];
      saveDB();
      return interaction.reply({ content: `✅ Routes for ${date} removed`, ephemeral: true });
    }

  }

  // ================= BUTTONS =================
  if (interaction.isButton()) {
    // TODO: handle ticket create/claim/close buttons here
  }
});

// ================= CRON =================
cron.schedule("0 0 * * *", async () => {
  const todayDate = new Date().toISOString().split("T")[0];
  const todayDay = new Date().toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  if (!db.routeSettings.channelId) return;
  const channel = await client.channels.fetch(db.routeSettings.channelId).catch(() => null);
  if (!channel) return;

  let data = db.routes[todayDate] || db.weeklyRoutes[todayDay];
  if (!data) return;

  const embed = new EmbedBuilder()
    .setTitle("🌟 Daily Featured Routes")
    .setDescription(`Featured routes for **${todayDate}**\n\n🔥 **${data.multiplier} Multiplier**\n\n${data.routes}`)
    .setColor(0xFFA500);
  await channel.send({ content: db.routeSettings.roleId ? `<@&${db.routeSettings.roleId}>` : null, embeds: [embed] });
});

// ================= LOGIN =================
client.login(TOKEN);
