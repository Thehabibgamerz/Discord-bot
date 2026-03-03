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
    PermissionsBitField,
    EmbedBuilder
} = require("discord.js");

const express = require("express");

// ================= ENV =================
const {
    TOKEN,
    CLIENT_ID,
    GUILD_ID,
    SUPPORT_ROLE_ID,
    RECRUITER_ROLE_ID,
    CATEGORY_ID,
    TICKET_LOG_CHANNEL_ID,
    OWNER_ID,
    WELCOME_CHANNEL_ID,
    LEAVE_CHANNEL_ID,
    AUTO_ROLE_ID,
    PORT
} = process.env;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.log("❌ Missing critical environment variables!");
    process.exit(1);
}

// ================= CLIENT =================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

// ================= EXPRESS (RAILWAY) =================
const app = express();
app.get("/", (req, res) => res.send("Bot is online ✅"));
app.listen(PORT || 3000, "0.0.0.0", () => {
    console.log(`🌐 Web server running`);
});

// ================= READY =================
client.once("ready", () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
});

// ================= WELCOME SYSTEM =================
client.on("guildMemberAdd", async (member) => {
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!channel) return;

    if (AUTO_ROLE_ID) {
        try { await member.roles.add(AUTO_ROLE_ID); } catch {}
    }

    const embed = new EmbedBuilder()
        .setTitle("🎉 Welcome!")
        .setDescription(`Welcome ${member} to **${member.guild.name}**!`)
        .setColor(0x00ff00)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `Member #${member.guild.memberCount}` })
        .setTimestamp();

    channel.send({ embeds: [embed] });

    try {
        await member.send(`👋 Welcome to **${member.guild.name}**! Enjoy your stay.`);
    } catch {}
});

// ================= LEAVE SYSTEM =================
client.on("guildMemberRemove", async (member) => {
    const channel = member.guild.channels.cache.get(LEAVE_CHANNEL_ID);
    if (!channel) return;

    channel.send(`😢 ${member.user.tag} has left the server.`);
});

// ================= SLASH COMMANDS =================
const commands = [
    new SlashCommandBuilder()
        .setName("panel")
        .setDescription("Send the ticket panel")
        .addChannelOption(opt => opt.setName("channel").setDescription("Channel").setRequired(true)),

    new SlashCommandBuilder()
        .setName("status")
        .setDescription("Change bot status")
        .addStringOption(opt => opt.setName("type").setRequired(true)
            .addChoices(
                { name: "Playing", value: "PLAYING" },
                { name: "Watching", value: "WATCHING" },
                { name: "Listening", value: "LISTENING" },
                { name: "Streaming", value: "STREAMING" }
            ))
        .addStringOption(opt => opt.setName("text").setRequired(true)),

    new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Create giveaway")
        .addStringOption(opt => opt.setName("title").setRequired(true))
        .addStringOption(opt => opt.setName("description").setRequired(true))
        .addStringOption(opt => opt.setName("prize").setRequired(true))
        .addChannelOption(opt => opt.setName("channel").setRequired(true))
        .addStringOption(opt => opt.setName("ends_on").setRequired(true))
].map(cmd => cmd.toJSON());

// ================= REGISTER =================
(async () => {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Slash commands registered");
})();

// ================= GIVEAWAY STORAGE =================
client.giveaways = new Map();

// ================= INTERACTIONS =================
client.on("interactionCreate", async interaction => {

    if (interaction.isChatInputCommand()) {

        // PANEL
        if (interaction.commandName === "panel") {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
                return interaction.reply({ content: "Admin only", ephemeral: true });

            const channel = interaction.options.getChannel("channel");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("create_general").setLabel("📩 General Support").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("create_recruit").setLabel("📝 Recruitment").setStyle(ButtonStyle.Secondary)
            );

            await channel.send({ content: "Open a ticket below:", components: [row] });
            return interaction.reply({ content: "Panel sent!", ephemeral: true });
        }

        // STATUS
        if (interaction.commandName === "status") {
            if (interaction.user.id !== OWNER_ID)
                return interaction.reply({ content: "Owner only", ephemeral: true });

            const type = interaction.options.getString("type");
            const text = interaction.options.getString("text");

            client.user.setActivity(text, { type: ActivityType[type] });
            return interaction.reply({ content: "Status updated", ephemeral: true });
        }

        // GIVEAWAY
        if (interaction.commandName === "giveaway") {
            const title = interaction.options.getString("title");
            const desc = interaction.options.getString("description");
            const prize = interaction.options.getString("prize");
            const channel = interaction.options.getChannel("channel");
            const end = new Date(interaction.options.getString("ends_on"));

            const participants = new Set();

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(desc)
                .addFields(
                    { name: "Prize", value: prize, inline: true },
                    { name: "Ends", value: end.toString(), inline: true }
                )
                .setColor(0xFFD700);

            const msg = await channel.send({ embeds: [embed] });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`join_${msg.id}`).setLabel("Join").setStyle(ButtonStyle.Success)
            );

            await msg.edit({ components: [row] });
            client.giveaways.set(msg.id, participants);

            setTimeout(async () => {
                const users = [...participants];
                const winner = users.length ? `<@${users[Math.floor(Math.random()*users.length)]}>` : "No participants";
                await channel.send(`🎉 Giveaway ended! Winner: ${winner}`);
                client.giveaways.delete(msg.id);
            }, end.getTime() - Date.now());

            return interaction.reply({ content: "Giveaway started!", ephemeral: true });
        }
    }

    // BUTTONS
    if (interaction.isButton()) {

        // Giveaway join
        if (interaction.customId.startsWith("join_")) {
            const id = interaction.customId.split("_")[1];
            const data = client.giveaways.get(id);
            if (!data) return interaction.reply({ content: "Ended", ephemeral: true });

            data.add(interaction.user.id);
            return interaction.reply({ content: "You joined!", ephemeral: true });
        }

        // Ticket creation
        if (interaction.customId === "create_general" || interaction.customId === "create_recruit") {

            const isRecruit = interaction.customId === "create_recruit";

            const channel = await interaction.guild.channels.create({
                name: `${isRecruit ? "recruitment" : "ticket"}-${interaction.user.username}`,
                type: ChannelType.GuildText,
                parent: CATEGORY_ID
            });

            await channel.send(`${isRecruit ? `<@&${RECRUITER_ROLE_ID}>` : `<@&${SUPPORT_ROLE_ID}>`} Ticket opened by ${interaction.user}`);

            return interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
        }
    }
});

client.login(TOKEN);
