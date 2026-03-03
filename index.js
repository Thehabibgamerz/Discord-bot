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

// ENV VARIABLES
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID; // Staff role
const CATEGORY_ID = process.env.CATEGORY_ID; // Tickets category
const OWNER_ID = process.env.OWNER_ID; // Bot owner
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID || !SUPPORT_ROLE_ID || !CATEGORY_ID || !OWNER_ID) {
  console.log("❌ Missing environment variables!");
  process.exit(1);
}

// Client
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Webserver for Railway
const app = express();
app.get("/", (req, res) => res.send("Bot is online ✅"));
app.listen(PORT, () => console.log(`🌐 Web server running on ${PORT}`));

// Slash commands
const commands = [
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Send the ticket panel"),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Change bot status (owner only)")
    .addStringOption(opt => opt.setName("type").setDescription("Status type").setRequired(true)
      .addChoices(
        { name: "Playing", value: "PLAYING" },
        { name: "Watching", value: "WATCHING" },
        { name: "Listening", value: "LISTENING" },
        { name: "Streaming", value: "STREAMING" }
      ))
    .addStringOption(opt => opt.setName("text").setDescription("Status text").setRequired(true)),

  new SlashCommandBuilder()
    .setName("createevent")
    .setDescription("Create an event")
    .addStringOption(opt => opt.setName("title").setDescription("Event title").setRequired(true))
    .addStringOption(opt => opt.setName("description").setDescription("Event description").setRequired(true))
    .addChannelOption(opt => opt.setName("channel").setDescription("Channel for event").setRequired(true))
    .addStringOption(opt => opt.setName("image").setDescription("Optional image URL"))
    .addStringOption(opt => opt.setName("mention").setDescription("Role ID to mention or 'everyone'"))
    .addStringOption(opt => opt.setName("start").setDescription("Start time YYYY-MM-DD HH:mm").setRequired(true))
    .addStringOption(opt => opt.setName("end").setDescription("End time YYYY-MM-DD HH:mm").setRequired(true))
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

// Track Event messages
client.eventMessages = new Map();

// Interaction handler
client.on("interactionCreate", async interaction => {
  // ================= SLASH COMMANDS =================
  if (interaction.isChatInputCommand()) {
    // ----- Ticket Panel -----
    if (interaction.commandName === "panel") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
        return interaction.reply({ content: "❌ Admin only.", ephemeral: true });

      const createBtn = new ButtonBuilder()
        .setCustomId("create_ticket")
        .setLabel("🎟 Create Ticket")
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(createBtn);

      return interaction.reply({ content: "🎟 Ticket Panel — click below to create a ticket.", components: [row] });
    }

    // ----- Owner-Only Status -----
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

      client.user.setActivity(text, { type: activityType, url: type === "STREAMING" ? "https://twitch.tv/discord" : undefined });

      return interaction.reply({ content: `✅ Status updated to ${type} ${text}`, ephemeral: true });
    }

    // ----- Create Event -----
    if (interaction.commandName === "createevent") {
      const title = interaction.options.getString("title");
      const description = interaction.options.getString("description");
      const channel = interaction.options.getChannel("channel");
      const image = interaction.options.getString("image");
      const mention = interaction.options.getString("mention") || null;
      const start = interaction.options.getString("start");
      const end = interaction.options.getString("end");

      const startDate = new Date(start);
      const endDate = new Date(end);

      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      const startStr = `${startDate.toLocaleDateString('en-US', options)} at ${startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
      const endStr = `${endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
      const timeFormatted = `${startStr} - ${endStr}`;

      const attendees = new Set();
      const notAttending = new Set();

      const attendingBtn = new ButtonBuilder().setCustomId("attending_event").setLabel("✅ I'm Attending").setStyle(ButtonStyle.Success);
      const notAttendingBtn = new ButtonBuilder().setCustomId("cant_attend_event").setLabel("❌ Can't Attend").setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(attendingBtn, notAttendingBtn);

      const embed = {
        title,
        description,
        color: 0x00FF00,
        image: image ? { url: image } : undefined,
        fields: [
          { name: "Time", value: timeFormatted, inline: true },
          { name: "Attending", value: "0", inline: true },
          { name: "Can't Attend", value: "0", inline: true }
        ]
      };

      const content = mention ? `<@&${mention}>` : null;

      const msg = await channel.send({ content, embeds: [embed], components: [row] });
      client.eventMessages.set(msg.id, { attendees, notAttending });

      return interaction.reply({ content: "✅ Event created!", ephemeral: true });
    }
  }

  // ================= BUTTON INTERACTIONS =================
  if (interaction.isButton()) {
    // ----- Ticket Buttons -----
    if (interaction.customId === "create_ticket") {
      const existing = interaction.guild.channels.cache.find(ch => ch.name === `ticket-${interaction.user.id}`);
      if (existing) return interaction.reply({ content: "❌ You already have a ticket!", ephemeral: true });

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

      const claimBtn = new ButtonBuilder().setCustomId("claim_ticket").setLabel("👤 Claim").setStyle(ButtonStyle.Success);
      const closeBtn = new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 Close").setStyle(ButtonStyle.Danger);
      const reopenBtn = new ButtonBuilder().setCustomId("reopen_ticket").setLabel("🔓 Reopen").setStyle(ButtonStyle.Primary).setDisabled(true);

      const row = new ActionRowBuilder().addComponents(claimBtn, closeBtn, reopenBtn);

      const embed = {
        title: `Ticket for ${interaction.user.username}`,
        description: `Opened by <@${interaction.user.id}>`,
        color: 0x00FF00,
        fields: [{ name: "Claimed by", value: "None", inline: true }]
      };

      await channel.send({ content: `<@&${SUPPORT_ROLE_ID}>`, embeds: [embed], components: [row] });
      return interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
    }

    // ----- Claim Ticket -----
    if (interaction.customId === "claim_ticket") {
      if (!interaction.member.roles.cache.has(SUPPORT_ROLE_ID))
        return interaction.reply({ content: "❌ Only staff can claim.", ephemeral: true });

      const message = interaction.message;
      const embed = message.embeds[0].toJSON();
      embed.fields[0].value = `<@${interaction.user.id}>`;
      await interaction.update({ embeds: [embed] });
      return;
    }

    // ----- Close Ticket -----
    if (interaction.customId === "close_ticket") {
      if (!interaction.member.roles.cache.has(SUPPORT_ROLE_ID))
        return interaction.reply({ content: "❌ Only staff can close.", ephemeral: true });

      const row = interaction.message.components[0].components;
      row.find(b => b.customId === "reopen_ticket").setDisabled(false);
      row.find(b => b.customId === "claim_ticket").setDisabled(true);
      row.find(b => b.customId === "close_ticket").setDisabled(true);

      await interaction.update({ components: [new ActionRowBuilder().addComponents(row)] });
      return;
    }

    // ----- Reopen Ticket -----
    if (interaction.customId === "reopen_ticket") {
      if (!interaction.member.roles.cache.has(SUPPORT_ROLE_ID))
        return interaction.reply({ content: "❌ Only staff can reopen.", ephemeral: true });

      const row = interaction.message.components[0].components;
      row.find(b => b.customId === "reopen_ticket").setDisabled(true);
      row.find(b => b.customId === "claim_ticket").setDisabled(false);
      row.find(b => b.customId === "close_ticket").setDisabled(false);

      await interaction.update({ components: [new ActionRowBuilder().addComponents(row)] });
      return;
    }

    // ----- Event Buttons -----
    if (client.eventMessages.has(interaction.message.id)) {
      const data = client.eventMessages.get(interaction.message.id);
      const embed = interaction.message.embeds[0].toJSON();

      if (interaction.customId === "attending_event") {
        data.notAttending.delete(interaction.user.id);
        data.attendees.add(interaction.user.id);
      } else if (interaction.customId === "cant_attend_event") {
        data.attendees.delete(interaction.user.id);
        data.notAttending.add(interaction.user.id);
      }

      embed.fields[1].value = `${data.attendees.size}`;
      embed.fields[2].value = `${data.notAttending.size}`;
      await interaction.update({ embeds: [embed] });
    }
  }
});

// Login
client.login(TOKEN);
