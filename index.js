// index.js
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  PermissionsBitField,
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

if (!fs.existsSync("./database.json")) {
  fs.writeFileSync(
    "./database.json",
    JSON.stringify({
      tickets: {},
      ticketCount: 0,
      routes: {},
      weeklyRoutes: {},
      routeSettings: { channelId: null, roleId: null }
    }, null, 2)
  );
}
let db = JSON.parse(fs.readFileSync("./database.json"));
const saveDB = () => fs.writeFileSync("./database.json", JSON.stringify(db, null, 2));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

// ================= SLASH COMMANDS =================
const commands = [
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
  new SlashCommandBuilder().setName("ticketpanel").setDescription("Send support ticket panel"),
  new SlashCommandBuilder()
    .setName("setroutechannel")
    .setDescription("Set channel for daily featured routes")
    .addChannelOption(o => o.setName("channel").setDescription("Select channel").setRequired(true)),
  new SlashCommandBuilder()
    .setName("setrouterole")
    .setDescription("Set role to ping in route posts")
    .addRoleOption(o => o.setName("role").setDescription("Select role").setRequired(true)),
  new SlashCommandBuilder()
    .setName("setroutes")
    .setDescription("Set routes for a specific date")
    .addStringOption(o => o.setName("date").setDescription("YYYY-MM-DD").setRequired(true))
    .addStringOption(o => o.setName("multiplier").setDescription("Example: 2x").setRequired(true))
    .addStringOption(o => o.setName("routes").setDescription("Emoji | Flight No | Route (newline)").setRequired(true)),
  new SlashCommandBuilder()
    .setName("viewroutes")
    .setDescription("View all routes"),
  new SlashCommandBuilder()
    .setName("removeroutes")
    .setDescription("Remove specific date routes")
    .addStringOption(o => o.setName("date").setDescription("YYYY-MM-DD").setRequired(true))
].map(cmd => cmd.toJSON());

// ================= REGISTER COMMANDS =================
(async () => {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    console.log("🛠 Registering slash commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Commands registered");
  } catch (err) { console.error(err); }
})();

// ================= CLIENT READY =================
client.once("clientReady", () => console.log(`🤖 Logged in as ${client.user.tag}`));

// ================= INTERACTIONS =================
client.on("interactionCreate", async interaction => {
  if (interaction.isChatInputCommand()) {
    // ---- PING ----
    if (interaction.commandName === "ping")
      return interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);

    // ---- SAY ----
    if (interaction.commandName === "say") {
      const text = interaction.options.getString("text");
      const channel = interaction.options.getChannel("channel") || interaction.channel;
      await channel.send({ content: text });
      return interaction.reply({ content: "✅ Message sent", ephemeral: true });
    }

    // ---- KICK ----
    if (interaction.commandName === "kick") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers))
        return interaction.reply({ content: "❌ No permission", ephemeral: true });
      const user = interaction.options.getUser("user");
      const member = interaction.guild.members.cache.get(user.id);
      if (member) { await member.kick(); return interaction.reply(`👢 Kicked ${user.tag}`); }
    }

    // ---- BAN ----
    if (interaction.commandName === "ban") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers))
        return interaction.reply({ content: "❌ No permission", ephemeral: true });
      const user = interaction.options.getUser("user");
      const member = interaction.guild.members.cache.get(user.id);
      if (member) { await member.ban(); return interaction.reply(`🔨 Banned ${user.tag}`); }
    }

    // ---- STATUS ----
    if (interaction.commandName === "status") {
      if (interaction.user.id !== OWNER_ID)
        return interaction.reply({ content: "❌ Owner only", ephemeral: true });
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
          `Welcome to the Akasa Air Virtual Support Center! ✈️\n` +
          `Our dedicated <@&${SUPPORT_ROLE_ID}> is here to help.\n\n` +
          `Select a category below to create a ticket:\n` +
          `- General Support\n- Recruitments\n- Executive Team Support\n- PIREP Support`
        )
        .setColor(0x00FF00);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_general").setLabel("General Support").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("ticket_recruit").setLabel("Recruitments").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("ticket_exec").setLabel("Executive Team").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("ticket_pirep").setLabel("PIREPS").setStyle(ButtonStyle.Primary)
      );

      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: "✅ Ticket panel sent", ephemeral: true });
    }

    // ---- FEATURED ROUTES ----
    if (interaction.commandName === "setroutechannel") {
      const channel = interaction.options.getChannel("channel");
      db.routeSettings.channelId = channel.id; saveDB();
      return interaction.reply({ content: `✅ Featured routes channel set to ${channel}`, ephemeral: true });
    }
    if (interaction.commandName === "setrouterole") {
      const role = interaction.options.getRole("role"); db.routeSettings.roleId = role.id; saveDB();
      return interaction.reply({ content: `✅ Route mention role set to ${role}`, ephemeral: true });
    }
    if (interaction.commandName === "setroutes") {
      const date = interaction.options.getString("date");
      const multiplier = interaction.options.getString("multiplier");
      const routes = interaction.options.getString("routes");
      db.routes[date] = { multiplier, routes }; saveDB();
      return interaction.reply({ content: `✅ Routes set for ${date}`, ephemeral: true });
    }
    if (interaction.commandName === "viewroutes") {
      let msg = "";
      for (const date in db.routes) msg += `**${date}**: ${db.routes[date].routes} (${db.routes[date].multiplier})\n\n`;
      return interaction.reply({ content: msg || "No routes set.", ephemeral: true });
    }
    if (interaction.commandName === "removeroutes") {
      const date = interaction.options.getString("date"); delete db.routes[date]; saveDB();
      return interaction.reply({ content: `✅ Routes for ${date} removed`, ephemeral: true });
    }
  }

  // ================= BUTTONS =================
  if (interaction.isButton()) {
    const { customId, user, guild } = interaction;
    const member = guild.members.cache.get(user.id);

    if (customId.startsWith("ticket_")) {
      const categoryMap = {
        "ticket_general": { name: "General Support" },
        "ticket_recruit": { name: "Recruitments" },
        "ticket_exec": { name: "Executive Team" },
        "ticket_pirep": { name: "PIREPS" }
      };
      const category = categoryMap[customId].name;

      // Prevent multiple tickets per user
      for (const id in db.tickets) {
        if (db.tickets[id].owner === user.id)
          return interaction.reply({ content: "❌ You already have a ticket open.", ephemeral: true });
      }

      db.ticketCount++;
      const ticketName = `ticket-${String(db.ticketCount).padStart(3, "0")}`;

      const ticketChannel = await guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        parent: CATEGORY_ID,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
          { id: user.id, allow: ["ViewChannel", "SendMessages"] },
          { id: SUPPORT_ROLE_ID, allow: ["ViewChannel", "SendMessages"] }
        ]
      });

      const embed = new EmbedBuilder()
        .setTitle(category)
        .setDescription(`Thanks for creating the ticket!\nOur staff team will contact you shortly.`)
        .addFields([{ name: "Opened by", value: `<@${user.id}>`, inline: true }])
        .setColor(0x00FF00);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("claim").setLabel("Claim").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("close").setLabel("Close").setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ content: `<@&${SUPPORT_ROLE_ID}>`, embeds: [embed], components: [row] });

      db.tickets[ticketChannel.id] = { owner: user.id, category, claimedBy: null, closed: false };
      saveDB();

      return interaction.reply({ content: `✅ Ticket created: ${ticketChannel}`, ephemeral: true });
    }

    // ---- Claim / Close buttons ----
    if (customId === "claim") {
      const ticket = db.tickets[interaction.channel.id];
      if (!ticket) return interaction.reply({ content: "❌ Not a ticket channel.", ephemeral: true });
      if (!member.roles.cache.has(SUPPORT_ROLE_ID))
        return interaction.reply({ content: "❌ Only staff can claim tickets.", ephemeral: true });

      ticket.claimedBy = user.id;
      saveDB();
      const embed = new EmbedBuilder()
        .setTitle(ticket.category)
        .setDescription(`Ticket claimed by <@${user.id}>`)
        .addFields([{ name: "Opened by", value: `<@${ticket.owner}>`, inline: true }, { name: "Claimed by", value: `<@${user.id}>`, inline: true }])
        .setColor(0x00FF00);

      return interaction.update({ embeds: [embed] });
    }

    if (customId === "close") {
      const ticket = db.tickets[interaction.channel.id];
      if (!ticket) return interaction.reply({ content: "❌ Not a ticket channel.", ephemeral: true });
      if (!member.roles.cache.has(SUPPORT_ROLE_ID))
        return interaction.reply({ content: "❌ Only staff can close tickets.", ephemeral: true });

      ticket.closed = true;
      saveDB();
      return interaction.update({ content: "✅ Ticket closed. Use /reopenticket or /deleteticket.", components: [], embeds: [] });
    }
  }
});

// ================= CRON DAILY ROUTES =================
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
