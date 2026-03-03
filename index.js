// ===========================================
// QPVA FINAL ADVANCED SUPPORT SYSTEM
// Commands: /panel /say /atis
// ===========================================

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
  PermissionsBitField,
  StringSelectMenuBuilder,
  EmbedBuilder,
  AttachmentBuilder
} = require("discord.js");

const express = require("express");
const transcripts = require("discord-html-transcripts");

// ================= ENV =================
const {
  TOKEN,
  CLIENT_ID,
  GUILD_ID,
  CATEGORY_ID,
  LOG_CHANNEL_ID,
  GENERAL_ROLE_ID,
  RECRUIT_ROLE_ID,
  PIREP_ROLE_ID,
  EXEC_ROLE_ID,
  ROUTES_ROLE_ID,
  INFINITE_API_KEY,
  PORT
} = process.env;

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.ticketCounter = 0;
client.ticketData = new Map();

// ================= EXPRESS =================
const app = express();
app.get("/", (req, res) => res.send("Bot Online"));
app.listen(PORT || 3000);

// ================= COMMANDS =================
const commands = [

  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Send support ticket panel")
    .addChannelOption(o =>
      o.setName("channel").setDescription("Channel").setRequired(true))
    .addStringOption(o =>
      o.setName("image").setDescription("Optional image URL")),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Make bot say something")
    .addChannelOption(o =>
      o.setName("channel").setDescription("Channel").setRequired(true))
    .addStringOption(o =>
      o.setName("message").setDescription("Message").setRequired(true)),

  new SlashCommandBuilder()
    .setName("atis")
    .setDescription("Get live Infinite Flight ATIS")
    .addStringOption(o =>
      o.setName("server")
        .setDescription("Server")
        .setRequired(true)
        .addChoices(
          { name: "Casual", value: "Casual Server" },
          { name: "Training", value: "Training Server" },
          { name: "Expert", value: "Expert Server" }
        ))
    .addStringOption(o =>
      o.setName("icao")
        .setDescription("Airport ICAO")
        .setRequired(true))

].map(cmd => cmd.toJSON());

// ================= REGISTER =================
(async () => {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
})();

// ================= READY =================
client.on("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ================= INTERACTIONS =================
client.on("interactionCreate", async interaction => {

try {

// ================= PANEL =================
if (interaction.isChatInputCommand() && interaction.commandName === "panel") {

  if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
    return interaction.reply({ content: "Admin only.", ephemeral: true });

  const channel = interaction.options.getChannel("channel");
  const image = interaction.options.getString("image");

  const embed = new EmbedBuilder()
    .setTitle("QPVA Support Centre!")
    .setDescription(`Welcome to the Akasa Air Virtual Support Center! ✈️
Need assistance? Select a category below.

We’re here to make your journey smooth and stress-free! 🌍`)
    .setColor(0x00bfff);

  if (image) embed.setImage(image);

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ticket_category")
      .setPlaceholder("🎟 Select Support Category")
      .addOptions([
        { label: "General Support", value: "general" },
        { label: "Recruitments", value: "recruit" },
        { label: "PIREP Support", value: "pirep" },
        { label: "Executive Team Support", value: "exec" },
        { label: "Routes Support", value: "routes" }
      ])
  );

  await channel.send({ embeds: [embed], components: [row] });
  return interaction.reply({ content: "Panel sent.", ephemeral: true });
}

// ================= SAY =================
if (interaction.isChatInputCommand() && interaction.commandName === "say") {

  if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
    return interaction.reply({ content: "Admin only.", ephemeral: true });

  const channel = interaction.options.getChannel("channel");
  const message = interaction.options.getString("message");

  await channel.send(message);
  return interaction.reply({ content: "Sent.", ephemeral: true });
}

// ================= ATIS FIXED =================
if (interaction.isChatInputCommand() && interaction.commandName === "atis") {

  await interaction.deferReply();

  const serverName = interaction.options.getString("server");
  const icao = interaction.options.getString("icao").toUpperCase();

  try {

    const serversRes = await fetch(`https://api.infiniteflight.com/public/v2/servers?apikey=${INFINITE_API_KEY}`);
    const servers = await serversRes.json();

    const server = servers.result.find(s => s.name === serverName);

    if (!server)
      return interaction.editReply("❌ Server not found.");

    const atisRes = await fetch(
      `https://api.infiniteflight.com/public/v2/airport/${icao}/atis?serverId=${server.id}&apikey=${INFINITE_API_KEY}`
    );

    const atis = await atisRes.json();

    if (!atis.result || atis.result.length === 0)
      return interaction.editReply("❌ No ATIS available.");

    const embed = new EmbedBuilder()
      .setTitle(`ATIS - ${icao}`)
      .addFields(
        { name: "Server", value: server.name, inline: true }
      )
      .setDescription(atis.result[0].text)
      .setColor(0x00ffcc)
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });

  } catch (err) {
    console.error(err);
    return interaction.editReply("❌ Failed to fetch ATIS.");
  }
}

// ================= CREATE TICKET =================
if (interaction.isStringSelectMenu()) {

  client.ticketCounter++;
  const ticketNumber = String(client.ticketCounter).padStart(3, "0");

  const categories = {
    general: { name: "General Support", role: GENERAL_ROLE_ID },
    recruit: { name: "Recruitments", role: RECRUIT_ROLE_ID },
    pirep: { name: "PIREP Support", role: PIREP_ROLE_ID },
    exec: { name: "Executive Team Support", role: EXEC_ROLE_ID },
    routes: { name: "Routes Support", role: ROUTES_ROLE_ID }
  };

  const selected = categories[interaction.values[0]];

  const channel = await interaction.guild.channels.create({
    name: `ticket-${ticketNumber}`,
    type: ChannelType.GuildText,
    parent: CATEGORY_ID,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: selected.role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
    ]
  });

  client.ticketData.set(channel.id, {
    number: ticketNumber,
    category: selected.name,
    openedBy: interaction.user.id,
    claimedBy: null
  });

  const embed = new EmbedBuilder()
    .setTitle(selected.name)
    .setDescription("Our staff team will contact you shortly!")
    .addFields(
      { name: "Opened by", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Claimed by", value: "Not claimed", inline: true }
    )
    .setColor(0x2ecc71);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("claim").setLabel("Claim").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("close").setLabel("Close").setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `<@&${selected.role}>`,
    embeds: [embed],
    components: [buttons]
  });

  return interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
}

// ================= BUTTON SYSTEM =================
if (interaction.isButton()) {

  const data = client.ticketData.get(interaction.channel.id);
  if (!data) return;

  const memberRoles = interaction.member.roles.cache;

  // STAFF CHECK
  const isStaff = [
    GENERAL_ROLE_ID,
    RECRUIT_ROLE_ID,
    PIREP_ROLE_ID,
    EXEC_ROLE_ID,
    ROUTES_ROLE_ID
  ].some(role => memberRoles.has(role));

  // CLAIM
  if (interaction.customId === "claim") {

    if (!isStaff)
      return interaction.reply({ content: "Staff only.", ephemeral: true });

    data.claimedBy = interaction.user.id;

    await interaction.channel.setName(`claimed-${data.number}`);

    const embed = new EmbedBuilder()
      .setTitle(data.category)
      .setDescription("Our staff team will contact you shortly!")
      .addFields(
        { name: "Opened by", value: `<@${data.openedBy}>`, inline: true },
        { name: "Claimed by", value: `<@${interaction.user.id}>`, inline: true }
      )
      .setColor(0x3498db);

    return interaction.update({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("close").setLabel("Close").setStyle(ButtonStyle.Danger)
        )
      ]
    });
  }

  // CLOSE + TRANSCRIPT
  if (interaction.customId === "close") {

    if (!isStaff)
      return interaction.reply({ content: "Staff only.", ephemeral: true });

    const transcript = await transcripts.createTranscript(interaction.channel);
    const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);

    const logEmbed = new EmbedBuilder()
      .setTitle("Ticket Closed")
      .addFields(
        { name: "Ticket", value: `ticket-${data.number}` },
        { name: "Opened By", value: `<@${data.openedBy}>` },
        { name: "Closed By", value: `<@${interaction.user.id}>` }
      )
      .setColor(0xff0000)
      .setTimestamp();

    await logChannel.send({
      embeds: [logEmbed],
      files: [transcript]
    });

    return interaction.channel.delete();
  }

}

} catch (err) {
  console.error(err);
}

});

client.login(TOKEN);
