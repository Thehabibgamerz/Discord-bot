// ===============================================
// QPVA COMPLETE PROFESSIONAL BOT - FINAL
// ===============================================

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
    PermissionsBitField,
    StringSelectMenuBuilder,
    AttachmentBuilder,
    EmbedBuilder
} = require("discord.js");

const express = require("express");
const fs = require("fs");

// ================= ENV =================
const {
    TOKEN,
    CLIENT_ID,
    GUILD_ID,
    CATEGORY_ID,
    LOG_CHANNEL_ID,
    OWNER_ID,
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

client.giveaways = new Map();
client.ticketCounter = 0;
client.ticketTimers = new Map();

// ================= EXPRESS =================
const app = express();
app.get("/", (req, res) => res.send("Bot Online ✅"));
app.listen(PORT || 3000);

// ================= SLASH COMMANDS =================
const commands = [

    new SlashCommandBuilder()
        .setName("panel")
        .setDescription("Send support ticket panel")
        .addChannelOption(o =>
            o.setName("channel").setDescription("Channel").setRequired(true))
        .addStringOption(o =>
            o.setName("image").setDescription("Optional image URL").setRequired(false)),

    new SlashCommandBuilder()
        .setName("status")
        .setDescription("Change bot status (Owner only)")
        .addStringOption(o =>
            o.setName("type").setDescription("Type").setRequired(true)
             .addChoices(
                { name: "Playing", value: "PLAYING" },
                { name: "Watching", value: "WATCHING" },
                { name: "Listening", value: "LISTENING" },
                { name: "Streaming", value: "STREAMING" }
             ))
        .addStringOption(o =>
            o.setName("text").setDescription("Text").setRequired(true)),

    new SlashCommandBuilder()
        .setName("say")
        .setDescription("Make bot say something")
        .addChannelOption(o =>
            o.setName("channel").setDescription("Channel").setRequired(true))
        .addStringOption(o =>
            o.setName("message").setDescription("Message").setRequired(true)),

    new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Create giveaway")
        .addStringOption(o => o.setName("title").setDescription("Title").setRequired(true))
        .addStringOption(o => o.setName("description").setDescription("Description").setRequired(true))
        .addStringOption(o => o.setName("prize").setDescription("Prize").setRequired(true))
        .addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true))
        .addIntegerOption(o => o.setName("duration").setDescription("Minutes").setRequired(true)),

    new SlashCommandBuilder()
        .setName("reroll")
        .setDescription("Reroll giveaway")
        .addStringOption(o =>
            o.setName("message_id").setDescription("Message ID").setRequired(true)),

    new SlashCommandBuilder()
        .setName("atis")
        .setDescription("Get live ATIS")
        .addStringOption(o =>
            o.setName("server").setDescription("Server").setRequired(true)
             .addChoices(
                { name: "Casual", value: "casual" },
                { name: "Training", value: "training" },
                { name: "Expert", value: "expert" }
             ))
        .addStringOption(o =>
            o.setName("icao").setDescription("Airport ICAO").setRequired(true))

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

// ================= TICKET FUNCTIONS =================
function resetInactivity(channel) {
    if (client.ticketTimers.has(channel.id)) {
        clearTimeout(client.ticketTimers.get(channel.id));
    }

    const timer = setTimeout(() => {
        channel.send("⏱ Ticket closed due to inactivity.");
        closeTicket(channel);
    }, 30 * 60 * 1000);

    client.ticketTimers.set(channel.id, timer);
}

async function closeTicket(channel) {
    const messages = await channel.messages.fetch({ limit: 100 });
    let transcript = "";

    messages.reverse().forEach(m => {
        transcript += `${m.author.tag}: ${m.content}\n`;
    });

    const filePath = `./transcript-${channel.id}.txt`;
    fs.writeFileSync(filePath, transcript);

    const logChannel = channel.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
        const file = new AttachmentBuilder(filePath);
        await logChannel.send({
            content: `📁 Ticket Closed: ${channel.name}`,
            files: [file]
        });
    }

    setTimeout(() => {
        channel.delete().catch(() => {});
        fs.unlinkSync(filePath);
    }, 3000);
}

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
Need assistance? Our staff will help you quickly and efficiently.

Please select a category below.`)
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

// ================= TICKET CREATE =================
if (interaction.isStringSelectMenu()) {

await interaction.deferReply({ ephemeral: true });

client.ticketCounter++;
const ticketNumber = String(client.ticketCounter).padStart(3, "0");

const roleMap = {
general: GENERAL_ROLE_ID,
recruit: RECRUIT_ROLE_ID,
pirep: PIREP_ROLE_ID,
exec: EXEC_ROLE_ID,
routes: ROUTES_ROLE_ID
};

const roleId = roleMap[interaction.values[0]];

const channel = await interaction.guild.channels.create({
name: `ticket-${ticketNumber}`,
type: ChannelType.GuildText,
parent: CATEGORY_ID,
topic: interaction.user.id,
permissionOverwrites: [
{ id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
{ id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
{ id: roleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
]
});

const embed = new EmbedBuilder()
.setTitle(`🎟 Ticket #${ticketNumber}`)
.setDescription("Our staff team will contact you shortly!")
.setColor(0x2ecc71);

const buttons = new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId("claim").setLabel("Claim").setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId("close").setLabel("Close").setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId("delete").setLabel("Delete").setStyle(ButtonStyle.Secondary)
);

await channel.send({
content: `<@${interaction.user.id}> <@&${roleId}>`,
embeds: [embed],
components: [buttons]
});

resetInactivity(channel);
return interaction.editReply(`Ticket created: ${channel}`);
}

// ================= BUTTONS =================
if (interaction.isButton()) {

if (interaction.customId === "claim") {
return interaction.reply(`🙋 Claimed by <@${interaction.user.id}>`);
}

if (interaction.customId === "close") {
await interaction.reply("🔒 Closing ticket...");
closeTicket(interaction.channel);
}

if (interaction.customId === "delete") {
await interaction.reply("🗑 Deleting ticket...");
interaction.channel.delete();
}

}

} catch (err) {
console.error(err);
}

});

client.on("messageCreate", message => {
if (!message.guild) return;
if (message.channel.name.startsWith("ticket-")) {
resetInactivity(message.channel);
}
});

client.login(TOKEN);
