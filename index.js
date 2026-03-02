const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  REST,
  Routes
} = require('discord.js');

const express = require('express');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID || !SUPPORT_ROLE_ID || !CATEGORY_ID) {
  console.log("❌ Missing environment variables!");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

/* ========= WEB SERVER FOR RAILWAY ========= */
const app = express();
app.get('/', (req, res) => res.send("Professional Ticket Bot Running ✅"));
app.listen(PORT, () => console.log(`🌐 Web server running on ${PORT}`));

/* ========= SLASH COMMANDS ========= */
const commands = [
  {
  name: "status",
  description: "Change bot status",
  options: [
    {
      name: "type",
      description: "Choose status type",
      type: 3,
      required: true,
      choices: [
        { name: "Playing", value: "PLAYING" },
        { name: "Watching", value: "WATCHING" },
        { name: "Listening", value: "LISTENING" },
        { name: "Streaming", value: "STREAMING" }
      ]
    },
    {
      name: "text",
      description: "Status text",
      type: 3,
      required: true
    }
  ]
  }
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Send the ticket panel')
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

  console.log("✅ Slash commands registered");
});

/* ========= INTERACTION HANDLER ========= */
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

if (interaction.commandName === "status") {
  const { ActivityType } = require("discord.js");

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

  await interaction.reply({
    content: `✅ Status updated to ${type} ${text}`,
    ephemeral: true
  });
}

  /* SLASH COMMAND */
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === 'panel') {

      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
        return interaction.reply({ content: "❌ Admin only.", ephemeral: true });

      const createBtn = new ButtonBuilder()
        .setCustomId('create_ticket')
        .setLabel('🎟 Create Ticket')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(createBtn);

      return interaction.reply({
        content: "🎟 **Support Ticket Panel**\nClick below to create a ticket.",
        components: [row]
      });
    }
  }

  /* BUTTON HANDLING */
  if (interaction.isButton()) {

    /* CREATE TICKET */
    if (interaction.customId === 'create_ticket') {

      const existing = interaction.guild.channels.cache.find(
        ch => ch.name === `ticket-${interaction.user.id}`
      );

      if (existing)
        return interaction.reply({ content: "❌ You already have an open ticket!", ephemeral: true });

      const channel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.id}`,
        type: ChannelType.GuildText,
        parent: CATEGORY_ID,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
          },
          {
            id: SUPPORT_ROLE_ID,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
          }
        ]
      });

      const claimBtn = new ButtonBuilder()
        .setCustomId('claim_ticket')
        .setLabel('👤 Claim')
        .setStyle(ButtonStyle.Success);

      const closeBtn = new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('🔒 Close')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(claimBtn, closeBtn);

      await channel.send({
        content: `🎟 Ticket created by <@${interaction.user.id}>\nSupport will assist you shortly.`,
        components: [row]
      });

      return interaction.reply({
        content: `✅ Ticket created: ${channel}`,
        ephemeral: true
      });
    }

    /* CLAIM TICKET */
    if (interaction.customId === 'claim_ticket') {

      if (!interaction.member.roles.cache.has(SUPPORT_ROLE_ID))
        return interaction.reply({ content: "❌ Support role only.", ephemeral: true });

      await interaction.channel.setName(`claimed-${interaction.user.username}`);

      return interaction.reply({
        content: `👤 Ticket claimed by ${interaction.user}`,
      });
    }

    /* CLOSE TICKET */
    if (interaction.customId === 'close_ticket') {

      if (!interaction.member.roles.cache.has(SUPPORT_ROLE_ID))
        return interaction.reply({ content: "❌ Support role only.", ephemeral: true });

      await interaction.reply("🔒 Closing ticket in 5 seconds...");
      setTimeout(() => interaction.channel.delete(), 5000);
    }
  }
});

client.login(TOKEN);
