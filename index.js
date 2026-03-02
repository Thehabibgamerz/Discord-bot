// index.js
const {
  Client,
  GatewayIntentBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  REST,
  Routes,
  ActivityType,
  PermissionsBitField
} = require("discord.js");
const express = require("express");

// Environment variables
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;
const OWNER_ID = process.env.OWNER_ID; // Add your Discord ID in Railway
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID || !SUPPORT_ROLE_ID || !CATEGORY_ID || !OWNER_ID) {
  console.log("❌ Missing environment variables!");
  process.exit(1);
}

// Client with only Guilds intent
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* ====== Web Server for Railway ====== */
const app = express();
app.get("/", (req, res) => res.send("Bot is online ✅"));
app.listen(PORT, () => console.log(`🌐 Web server running on ${PORT}`));

/* ====== Slash Commands ====== */
const commands = [
  // Ticket panel
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Send the ticket panel"),

  // Status command
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Change bot status (owner only)")
    .addStringOption(option =>
      option
        .setName("type")
        .setDescription("Choose status type")
        .setRequired(true)
        .addChoices(
          { name: "Playing", value: "PLAYING" },
          { name: "Watching", value: "WATCHING" },
          { name: "Listening", value: "LISTENING" },
          { name: "Streaming", value: "STREAMING" }
        )
    )
    .addStringOption(option =>
      option
        .setName("text")
        .setDescription("Status text")
        .setRequired(true)
    )
].map(cmd => cmd.toJSON());

// Register commands
client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("✅ Slash commands registered");
  } catch (err) {
    console.error(err);
  }
});

/* ====== Interaction Handler ====== */
client.on("interactionCreate", async interaction => {
  if (interaction.isChatInputCommand()) {
    // ===== Panel =====
    if (interaction.commandName === "panel") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
        return interaction.reply({ content: "❌ Admin only.", ephemeral: true });

      const createBtn = new ButtonBuilder()
        .setCustomId("create_ticket")
        .setLabel("🎟 Create Ticket")
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(createBtn);

      return interaction.reply({
        content: "🎟 Ticket Panel — click below to create a ticket.",
        components: [row]
      });
    }

    // ===== Owner-Only Status =====
    if (interaction.commandName === "status") {
      if (interaction.user.id !== OWNER_ID)
        return interaction.reply({ content: "❌ Only the bot owner can use this command.", ephemeral: true });

      const type = interaction.options.getString("type");
      const text = interaction.options.getString("text");

      let activityType;
      if (type === "PLAYING") activityType = ActivityType.Playing;
      if (type === "WATCHING") activityType = ActivityType.Watching;
      if (type === "LISTENING") activityType = ActivityType.Listening;
      if (type === "STREAMING") activityType = ActivityType.Streaming;

      client.user.setActivity(text, {
        type: activityType,
        url: type === "STREAMING" ? "https://twitch.tv/discord" : undefined
      });

      return interaction.reply({ content: `✅ Status updated to ${type} ${text}`, ephemeral: true });
    }
  }

  // ===== Button Interactions =====
  if (interaction.isButton()) {
    const id = interaction.customId;

    // Create Ticket
    if (id === "create_ticket") {
      const existing = interaction.guild.channels.cache.find(
        ch => ch.name === `ticket-${interaction.user.id}`
      );
      if (existing)
        return interaction.reply({ content: "❌ You already have a ticket!", ephemeral: true });

      const channel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.id}`,
        type: ChannelType.GuildText,
        parent: CATEGORY_ID,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: SUPPORT_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      const claimBtn = new ButtonBuilder()
        .setCustomId("claim_ticket")
        .setLabel("👤 Claim")
        .setStyle(ButtonStyle.Success);

      const closeBtn = new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("🔒 Close")
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(claimBtn, closeBtn);

      await channel.send({
        content: `🎟 Ticket created by <@${interaction.user.id}>`,
        components: [row]
      });

      return interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
    }

    // Claim Ticket
    if (id === "claim_ticket") {
      if (!interaction.member.roles.cache.has(SUPPORT_ROLE_ID))
        return interaction.reply({ content: "❌ Support role only.", ephemeral: true });

      await interaction.channel.setName(`claimed-${interaction.user.username}`);
      return interaction.reply({ content: `👤 Ticket claimed by ${interaction.user}` });
    }

    // Close Ticket
    if (id === "close_ticket") {
      if (!interaction.member.roles.cache.has(SUPPORT_ROLE_ID))
        return interaction.reply({ content: "❌ Support role only.", ephemeral: true });

      await interaction.reply("🔒 Closing ticket in 5 seconds...");
      setTimeout(() => interaction.channel.delete(), 5000);
    }
  }
});

// Login
client.login(TOKEN);
