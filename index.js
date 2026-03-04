// ================== IMPORTS ==================
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  ChannelType,
  PermissionsBitField
} = require("discord.js");

const cron = require("node-cron");
const fs = require("fs");

// ================== CONFIG ==================
const TOKEN = process.env.TOKEN;
const STAFF_ROLE = "1389824693388837035";
const RECRUITER_ROLE = "YOUR_RECRUITER_ROLE_ID";
const ROUTE_PING_ROLE = "YOUR_ROUTE_ROLE_ID";
const ATIS_API_KEY = process.env.IF_API_KEY;

// ================== CLIENT ==================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

// ================== DATABASE ==================
let db = JSON.parse(fs.readFileSync("./database.json"));
function saveDB() {
  fs.writeFileSync("./database.json", JSON.stringify(db, null, 2));
}

// ================== READY ==================
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  await client.application.commands.set([

    // Ticket Panel
    new SlashCommandBuilder()
      .setName("ticketpanel")
      .setDescription("Send ticket panel"),

    new SlashCommandBuilder()
      .setName("closeticket")
      .setDescription("Close ticket"),

    new SlashCommandBuilder()
      .setName("reopenticket")
      .setDescription("Reopen ticket"),

    new SlashCommandBuilder()
      .setName("deleteticket")
      .setDescription("Delete ticket"),

    // Giveaway
    new SlashCommandBuilder()
      .setName("giveaway")
      .setDescription("Create giveaway")
      .addStringOption(o => o.setName("title").setRequired(true))
      .addStringOption(o => o.setName("description").setRequired(true))
      .addIntegerOption(o => o.setName("minutes").setRequired(true))
      .addIntegerOption(o => o.setName("winners").setRequired(true))
      .addChannelOption(o => o.setName("channel").setRequired(true)),

    // Event
    new SlashCommandBuilder()
      .setName("event")
      .setDescription("Create event")
      .addStringOption(o => o.setName("title").setRequired(true))
      .addStringOption(o => o.setName("description").setRequired(true))
      .addStringOption(o => o.setName("time").setRequired(true))
      .addChannelOption(o => o.setName("channel").setRequired(true)),

    // Routes
    new SlashCommandBuilder()
      .setName("setroutes")
      .setDescription("Set daily routes")
      .addStringOption(o => o.setName("day").setRequired(true))
      .addStringOption(o => o.setName("routes").setRequired(true)),

    new SlashCommandBuilder()
      .setName("viewroutes")
      .setDescription("View routes"),

    new SlashCommandBuilder()
      .setName("removeroutes")
      .setDescription("Remove routes")
      .addStringOption(o => o.setName("day").setRequired(true)),

    // ATIS
    new SlashCommandBuilder()
      .setName("atis")
      .setDescription("Get Infinite Flight ATIS")
      .addStringOption(o => o.setName("airport").setRequired(true)),

    // Status
    new SlashCommandBuilder()
      .setName("status")
      .setDescription("Change bot status")
      .addStringOption(o => o.setName("type").setRequired(true))
      .addStringOption(o => o.setName("text").setRequired(true)),

    // Say
    new SlashCommandBuilder()
      .setName("say")
      .setDescription("Bot say message")
      .addStringOption(o => o.setName("text").setRequired(true))
      .addChannelOption(o => o.setName("channel").setRequired(false)),

    // Role add/remove
    new SlashCommandBuilder()
      .setName("addrole")
      .setDescription("Add role to user")
      .addUserOption(o => o.setName("user").setRequired(true))
      .addRoleOption(o => o.setName("role").setRequired(true)),

    new SlashCommandBuilder()
      .setName("removerole")
      .setDescription("Remove role from user")
      .addUserOption(o => o.setName("user").setRequired(true))
      .addRoleOption(o => o.setName("role").setRequired(true))
  ]);

  // Midnight UTC Featured Routes
  cron.schedule("0 0 * * *", () => {
    const day = new Date().toLocaleString("en-US", { weekday: "long", timeZone: "UTC" });
    if (!db.routes[day]) return;

    const embed = new EmbedBuilder()
      .setTitle("✈️ Daily Featured Routes")
      .setDescription(`**${day}**\n\n${db.routes[day]}`)
      .setColor("Blue");

    client.guilds.cache.forEach(guild => {
      const channel = guild.systemChannel;
      if (channel)
        channel.send({ content: `<@&${ROUTE_PING_ROLE}>`, embeds: [embed] });
    });
  });
});

// ================== INTERACTIONS ==================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // STATUS
  if (commandName === "status") {
    const type = interaction.options.getString("type");
    const text = interaction.options.getString("text");
    client.user.setActivity(text, { type: type.toUpperCase() });
    return interaction.reply({ content: "✅ Status updated", ephemeral: true });
  }

  // SAY
  if (commandName === "say") {
    const text = interaction.options.getString("text");
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    channel.send(text);
    return interaction.reply({ content: "Sent.", ephemeral: true });
  }

  // ADD ROLE
  if (commandName === "addrole") {
    const user = interaction.options.getMember("user");
    const role = interaction.options.getRole("role");
    await user.roles.add(role);
    return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Role added to ${user}`)] });
  }

  // REMOVE ROLE
  if (commandName === "removerole") {
    const user = interaction.options.getMember("user");
    const role = interaction.options.getRole("role");
    await user.roles.remove(role);
    return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`❌ Role removed from ${user}`)] });
  }

  // ATIS (Built-in fetch)
  if (commandName === "atis") {
    const airport = interaction.options.getString("airport").toUpperCase();
    try {
      const res = await fetch(`https://api.infiniteflight.com/public/v2/atis/${airport}?apikey=${ATIS_API_KEY}`);
      const data = await res.json();
      if (!data.result)
        return interaction.reply({ content: "No ATIS found.", ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle(`ATIS - ${airport}`)
        .setDescription(data.result)
        .setColor("Green");

      return interaction.reply({ embeds: [embed] });
    } catch {
      return interaction.reply({ content: "ATIS error.", ephemeral: true });
    }
  }
});

client.login(TOKEN);
