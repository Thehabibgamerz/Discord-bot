// =============================
// QPVA COMPLETE BOT - index.js
// =============================

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

// ================= ENV VARIABLES =================
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

if (
    !TOKEN ||
    !CLIENT_ID ||
    !GUILD_ID ||
    !CATEGORY_ID ||
    !OWNER_ID ||
    !GENERAL_ROLE_ID ||
    !RECRUIT_ROLE_ID ||
    !PIREP_ROLE_ID ||
    !EXEC_ROLE_ID ||
    !ROUTES_ROLE_ID
) {
    console.log("❌ Missing required environment variables!");
    process.exit(1);
}

// ================= CLIENT =================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.giveaways = new Map();

// ================= EXPRESS SERVER =================
const app = express();
app.get("/", (req, res) => res.send("Bot is online ✅"));
app.listen(PORT || 3000, () =>
    console.log(`🌐 Web server running on ${PORT || 3000}`)
);

// ================= SLASH COMMANDS =================
const commands = [

    new SlashCommandBuilder()
        .setName("panel")
        .setDescription("Send support ticket panel")
        .addChannelOption(o =>
            o.setName("channel")
             .setDescription("Channel where panel will be sent")
             .setRequired(true)
        ),

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
             )
        )
        .addStringOption(o =>
            o.setName("text")
             .setDescription("Status text")
             .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("say")
        .setDescription("Make bot say something")
        .addChannelOption(o =>
            o.setName("channel")
             .setDescription("Channel to send message")
             .setRequired(true)
        )
        .addStringOption(o =>
            o.setName("message")
             .setDescription("Message content")
             .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Create a giveaway")
        .addStringOption(o =>
            o.setName("title")
             .setDescription("Giveaway title")
             .setRequired(true)
        )
        .addStringOption(o =>
            o.setName("description")
             .setDescription("Giveaway description")
             .setRequired(true)
        )
        .addStringOption(o =>
            o.setName("prize")
             .setDescription("Prize for winner")
             .setRequired(true)
        )
        .addChannelOption(o =>
            o.setName("channel")
             .setDescription("Channel to post giveaway")
             .setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("duration")
             .setDescription("Duration in minutes")
             .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("reroll")
        .setDescription("Reroll giveaway winner")
        .addStringOption(o =>
            o.setName("message_id")
             .setDescription("Giveaway message ID")
             .setRequired(true)
        )

].map(cmd => cmd.toJSON());

// ================= REGISTER COMMANDS =================
(async () => {
    try {
        const rest = new REST({ version: "10" }).setToken(TOKEN);
        console.log("🛠 Registering slash commands...");
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );
        console.log("✅ Slash commands registered.");
    } catch (err) {
        console.error("❌ Failed to register commands:", err);
    }
})();

// ================= READY =================
client.on("ready", () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
});

// ================= INTERACTIONS =================
client.on("interactionCreate", async interaction => {
    try {

        // ================= SLASH COMMANDS =================
        if (interaction.isChatInputCommand()) {

            // PANEL
            if (interaction.commandName === "panel") {

                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
                    return interaction.reply({ content: "❌ Admin only.", ephemeral: true });

                const channel = interaction.options.getChannel("channel");

                const embed = {
                    title: "🎫 QPVA Support Center",
                    description: "Select a department below.",
                    color: 0x00ff00
                };

                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId("ticket_category")
                        .setPlaceholder("🎟 Select Category")
                        .addOptions([
                            { label: "General Support", value: "general", emoji: "🛠" },
                            { label: "Recruitments", value: "recruit", emoji: "👨‍✈️" },
                            { label: "PIREP Support", value: "pirep", emoji: "📄" },
                            { label: "Executive Team Support", value: "exec", emoji: "👔" },
                            { label: "Routes Support", value: "routes", emoji: "🗺️" }
                        ])
                );

                await channel.send({ embeds: [embed], components: [row] });
                return interaction.reply({ content: "✅ Panel sent.", ephemeral: true });
            }

            // STATUS
            if (interaction.commandName === "status") {

                if (interaction.user.id !== OWNER_ID)
                    return interaction.reply({ content: "❌ Owner only.", ephemeral: true });

                const type = interaction.options.getString("type");
                const text = interaction.options.getString("text");

                let activity = ActivityType.Playing;
                if (type === "WATCHING") activity = ActivityType.Watching;
                if (type === "LISTENING") activity = ActivityType.Listening;
                if (type === "STREAMING") activity = ActivityType.Streaming;

                client.user.setActivity(text, { type: activity });

                return interaction.reply({ content: "✅ Status updated.", ephemeral: true });
            }

            // SAY
            if (interaction.commandName === "say") {

                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
                    return interaction.reply({ content: "❌ Admin only.", ephemeral: true });

                const channel = interaction.options.getChannel("channel");
                const message = interaction.options.getString("message");

                await channel.send(message);
                return interaction.reply({ content: "✅ Message sent.", ephemeral: true });
            }
        }

    } catch (error) {
        console.error("Interaction Error:", error);
    }
});

client.login(TOKEN);
