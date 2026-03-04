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

// ================= CONFIG =================
const TOKEN = process.env.TOKEN;
const STAFF_ROLE = "1389824693388837035";
const RECRUITER_ROLE = "YOUR_RECRUITER_ROLE_ID";
const ROUTE_ROLE = "YOUR_ROUTE_ROLE_ID";
const IF_API_KEY = process.env.IF_API_KEY;

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

function saveDB() {
  fs.writeFileSync("./database.json", JSON.stringify(db, null, 2));
}

// ================= READY =================
client.once("clientReady", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const commands = [

    // TICKET PANEL
    new SlashCommandBuilder()
      .setName("ticketpanel")
      .setDescription("Send support ticket panel"),

    new SlashCommandBuilder()
      .setName("closeticket")
      .setDescription("Close the current ticket"),

    new SlashCommandBuilder()
      .setName("reopenticket")
      .setDescription("Reopen the current ticket"),

    new SlashCommandBuilder()
      .setName("deleteticket")
      .setDescription("Delete the current ticket"),

    // STATUS
    new SlashCommandBuilder()
      .setName("status")
      .setDescription("Change bot status")
      .addStringOption(option =>
        option
          .setName("type")
          .setDescription("playing / watching / listening")
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName("text")
          .setDescription("Status text")
          .setRequired(true)
      ),

    // SAY
    new SlashCommandBuilder()
      .setName("say")
      .setDescription("Make the bot send a message")
      .addStringOption(option =>
        option
          .setName("text")
          .setDescription("Message to send")
          .setRequired(true)
      )
      .addChannelOption(option =>
        option
          .setName("channel")
          .setDescription("Channel to send message")
          .setRequired(false)
      ),

    // ADD ROLE
    new SlashCommandBuilder()
      .setName("addrole")
      .setDescription("Add role to user")
      .addUserOption(option =>
        option
          .setName("user")
          .setDescription("Select user")
          .setRequired(true)
      )
      .addRoleOption(option =>
        option
          .setName("role")
          .setDescription("Select role")
          .setRequired(true)
      ),

    // REMOVE ROLE
    new SlashCommandBuilder()
      .setName("removerole")
      .setDescription("Remove role from user")
      .addUserOption(option =>
        option
          .setName("user")
          .setDescription("Select user")
          .setRequired(true)
      )
      .addRoleOption(option =>
        option
          .setName("role")
          .setDescription("Select role")
          .setRequired(true)
      ),

    // ATIS
    new SlashCommandBuilder()
      .setName("atis")
      .setDescription("Get Infinite Flight ATIS")
      .addStringOption(option =>
        option
          .setName("airport")
          .setDescription("Airport ICAO code (e.g. OMDB)")
          .setRequired(true)
      )
  ];

  await client.application.commands.set(commands);
  console.log("✅ Slash commands registered");

  // DAILY ROUTES MIDNIGHT UTC
  cron.schedule("0 0 * * *", () => {
    const day = new Date().toLocaleString("en-US", {
      weekday: "long",
      timeZone: "UTC"
    });

    if (!db.routes[day]) return;

    const embed = new EmbedBuilder()
      .setTitle("✈️ Daily Featured Routes")
      .setDescription(db.routes[day])
      .setColor("Blue");

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

// ================= INTERACTION HANDLER =================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // STATUS
  if (commandName === "status") {
    const type = interaction.options.getString("type");
    const text = interaction.options.getString("text");

    const map = {
      playing: 0,
      streaming: 1,
      listening: 2,
      watching: 3
    };

    client.user.setActivity(text, { type: map[type] || 0 });

    return interaction.reply({
      content: "✅ Status updated",
      ephemeral: true
    });
  }

  // SAY
  if (commandName === "say") {
    const text = interaction.options.getString("text");
    const channel = interaction.options.getChannel("channel") || interaction.channel;

    await channel.send(text);

    return interaction.reply({
      content: "✅ Message sent",
      ephemeral: true
    });
  }

  // ADD ROLE
  if (commandName === "addrole") {
    const member = interaction.options.getMember("user");
    const role = interaction.options.getRole("role");

    await member.roles.add(role);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Green")
          .setDescription(`✅ Added ${role} to ${member}`)
      ]
    });
  }

  // REMOVE ROLE
  if (commandName === "removerole") {
    const member = interaction.options.getMember("user");
    const role = interaction.options.getRole("role");

    await member.roles.remove(role);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(`❌ Removed ${role} from ${member}`)
      ]
    });
  }

  // ATIS
  if (commandName === "atis") {
    const airport = interaction.options.getString("airport").toUpperCase();

    try {
      const response = await fetch(
        `https://api.infiniteflight.com/public/v2/atis/${airport}?apikey=${IF_API_KEY}`
      );

      const data = await response.json();

      if (!data.result)
        return interaction.reply({
          content: "No ATIS found.",
          ephemeral: true
        });

      const embed = new EmbedBuilder()
        .setTitle(`ATIS - ${airport}`)
        .setDescription(data.result)
        .setColor("Blue");

      return interaction.reply({ embeds: [embed] });

    } catch (err) {
      return interaction.reply({
        content: "ATIS API error.",
        ephemeral: true
      });
    }
  }
});

client.login(TOKEN);
