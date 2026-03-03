// =======================================
// QPVA COMPLETE BOT (Tickets + Commands)
// =======================================

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
    StringSelectMenuBuilder
} = require("discord.js");

const express = require("express");

// ================= ENV =================
const {
    TOKEN,
    CLIENT_ID,
    GUILD_ID,
    CATEGORY_ID,
    OWNER_ID,
    GENERAL_ROLE_ID,
    RECRUIT_ROLE_ID,
    PIREP_ROLE_ID,
    EXEC_ROLE_ID,
    ROUTES_ROLE_ID,
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

// ================= EXPRESS =================
const app = express();
app.get("/", (req, res) => res.send("Bot Online ✅"));
app.listen(PORT || 3000);

// ================= SLASH COMMANDS =================
const commands = [

    // PANEL
    new SlashCommandBuilder()
        .setName("panel")
        .setDescription("Send ticket support panel")
        .addChannelOption(o =>
            o.setName("channel")
             .setDescription("Channel to send panel")
             .setRequired(true))
        .addStringOption(o =>
            o.setName("image")
             .setDescription("Optional image URL")
             .setRequired(false)
        ),

    // STATUS
    new SlashCommandBuilder()
        .setName("status")
        .setDescription("Change bot status (Owner only)")
        .addStringOption(o =>
            o.setName("type")
             .setDescription("Activity type")
             .setRequired(true)
             .addChoices(
                { name: "Playing", value: "PLAYING" },
                { name: "Watching", value: "WATCHING" },
                { name: "Listening", value: "LISTENING" },
                { name: "Streaming", value: "STREAMING" }
             ))
        .addStringOption(o =>
            o.setName("text")
             .setDescription("Status text")
             .setRequired(true)
        ),

    // SAY
    new SlashCommandBuilder()
        .setName("say")
        .setDescription("Make bot say something")
        .addChannelOption(o =>
            o.setName("channel")
             .setDescription("Channel to send message")
             .setRequired(true))
        .addStringOption(o =>
            o.setName("message")
             .setDescription("Message content")
             .setRequired(true)
        ),

    // GIVEAWAY
    new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Create a giveaway")
        .addStringOption(o =>
            o.setName("title")
             .setDescription("Giveaway title")
             .setRequired(true))
        .addStringOption(o =>
            o.setName("description")
             .setDescription("Giveaway description")
             .setRequired(true))
        .addStringOption(o =>
            o.setName("prize")
             .setDescription("Prize")
             .setRequired(true))
        .addChannelOption(o =>
            o.setName("channel")
             .setDescription("Channel to post giveaway")
             .setRequired(true))
        .addIntegerOption(o =>
            o.setName("duration")
             .setDescription("Duration in minutes")
             .setRequired(true)
        ),

    // REROLL
    new SlashCommandBuilder()
        .setName("reroll")
        .setDescription("Reroll giveaway winner")
        .addStringOption(o =>
            o.setName("message_id")
             .setDescription("Giveaway message ID")
             .setRequired(true)
        )

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

    // ================= SLASH =================
    if (interaction.isChatInputCommand()) {

        // PANEL
        if (interaction.commandName === "panel") {

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
                return interaction.reply({ content: "Admin only.", ephemeral: true });

            const channel = interaction.options.getChannel("channel");
            const image = interaction.options.getString("image");

            const embed = {
                title: "QPVA Support Centre!",
                description:
`Welcome to the Akasa Air Virtual Support Center! ✈️
Need assistance with Akasa Air services? You’re in the right place! Our dedicated <@&1389824693388837035> is available to help you quickly and efficiently.

Please select a category below to get started, and we’ll connect you with the right support right away.

We’re here to make your journey with Akasa Air smooth and stress-free! 🌍✈️`,
                color: 0x00bfff
            };

            if (image) embed.image = { url: image };

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId("ticket_category")
                    .setPlaceholder("🎟 Select Support Category")
                    .addOptions([
                        { label: "General Support", value: "general", emoji: "🛠" },
                        { label: "Recruitments", value: "recruit", emoji: "👨‍✈️" },
                        { label: "PIREP Support", value: "pirep", emoji: "📄" },
                        { label: "Executive Team Support", value: "exec", emoji: "👔" },
                        { label: "Routes Support", value: "routes", emoji: "🗺️" }
                    ])
            );

            await channel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: "✅ Panel sent!", ephemeral: true });
        }

        // STATUS
        if (interaction.commandName === "status") {
            if (interaction.user.id !== OWNER_ID)
                return interaction.reply({ content: "Owner only.", ephemeral: true });

            const type = interaction.options.getString("type");
            const text = interaction.options.getString("text");

            let activity = ActivityType.Playing;
            if (type === "WATCHING") activity = ActivityType.Watching;
            if (type === "LISTENING") activity = ActivityType.Listening;
            if (type === "STREAMING") activity = ActivityType.Streaming;

            client.user.setActivity(text, { type: activity });

            return interaction.reply({ content: "Status updated.", ephemeral: true });
        }

        // SAY
        if (interaction.commandName === "say") {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
                return interaction.reply({ content: "Admin only.", ephemeral: true });

            const channel = interaction.options.getChannel("channel");
            const message = interaction.options.getString("message");

            await channel.send(message);
            return interaction.reply({ content: "Message sent.", ephemeral: true });
        }
    }

    // ================= TICKET CREATION =================
    if (interaction.isStringSelectMenu()) {

        const category = interaction.values[0];

        const roleMap = {
            general: GENERAL_ROLE_ID,
            recruit: RECRUIT_ROLE_ID,
            pirep: PIREP_ROLE_ID,
            exec: EXEC_ROLE_ID,
            routes: ROUTES_ROLE_ID
        };

        const roleId = roleMap[category];

        const channel = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: CATEGORY_ID,
            topic: interaction.user.id,
            permissionOverwrites: [
                { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: roleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ]
        });

        await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
    }
});

client.login(TOKEN);
