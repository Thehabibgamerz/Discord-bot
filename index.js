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

// ================= EXPRESS (Railway Uptime) =================
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
            o.setName("channel").setDescription("Channel").setRequired(true)),

    new SlashCommandBuilder()
        .setName("status")
        .setDescription("Change bot status (Owner only)")
        .addStringOption(o =>
            o.setName("type")
                .setRequired(true)
                .addChoices(
                    { name: "Playing", value: "PLAYING" },
                    { name: "Watching", value: "WATCHING" },
                    { name: "Listening", value: "LISTENING" },
                    { name: "Streaming", value: "STREAMING" }
                ))
        .addStringOption(o =>
            o.setName("text").setRequired(true)),

    new SlashCommandBuilder()
        .setName("say")
        .setDescription("Make bot say something")
        .addChannelOption(o =>
            o.setName("channel").setRequired(true))
        .addStringOption(o =>
            o.setName("message").setRequired(true)),

    new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Create giveaway")
        .addStringOption(o => o.setName("title").setRequired(true))
        .addStringOption(o => o.setName("description").setRequired(true))
        .addStringOption(o => o.setName("prize").setRequired(true))
        .addChannelOption(o => o.setName("channel").setRequired(true))
        .addIntegerOption(o =>
            o.setName("duration").setDescription("Duration in minutes").setRequired(true)),

    new SlashCommandBuilder()
        .setName("reroll")
        .setDescription("Reroll giveaway winner")
        .addStringOption(o =>
            o.setName("message_id").setRequired(true))

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

        // ================= SLASH =================
        if (interaction.isChatInputCommand()) {

            // PANEL
            if (interaction.commandName === "panel") {

                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
                    return interaction.reply({ content: "❌ Admin only.", ephemeral: true });

                const channel = interaction.options.getChannel("channel");

                const embed = {
                    title: "🎫 QPVA Support Center",
                    description: "Please select a department below.",
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

            // GIVEAWAY
            if (interaction.commandName === "giveaway") {

                const title = interaction.options.getString("title");
                const description = interaction.options.getString("description");
                const prize = interaction.options.getString("prize");
                const channel = interaction.options.getChannel("channel");
                const duration = interaction.options.getInteger("duration");

                const participants = new Set();

                const embed = {
                    title,
                    description,
                    color: 0xffd700,
                    fields: [
                        { name: "Prize", value: prize },
                        { name: "Ends In", value: `${duration} minutes` },
                        { name: "Participants", value: "None" }
                    ]
                };

                const msg = await channel.send({ embeds: [embed] });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`join_${msg.id}`)
                        .setLabel("Join")
                        .setStyle(ButtonStyle.Success)
                );

                await msg.edit({ components: [row] });

                client.giveaways.set(msg.id, { participants });

                setTimeout(async () => {
                    const data = client.giveaways.get(msg.id);
                    if (!data) return;

                    const users = [...data.participants];
                    const winner = users.length
                        ? users[Math.floor(Math.random() * users.length)]
                        : null;

                    await msg.edit({
                        embeds: [{
                            title: `${title} - Ended`,
                            description,
                            color: 0x00ff00,
                            fields: [
                                { name: "Prize", value: prize },
                                { name: "Winner", value: winner ? `<@${winner}>` : "No participants" }
                            ]
                        }],
                        components: []
                    });

                    client.giveaways.delete(msg.id);

                }, duration * 60000);

                return interaction.reply({ content: "✅ Giveaway started.", ephemeral: true });
            }

            // REROLL
            if (interaction.commandName === "reroll") {

                const id = interaction.options.getString("message_id");
                const data = client.giveaways.get(id);

                if (!data)
                    return interaction.reply({ content: "❌ Giveaway not active.", ephemeral: true });

                const users = [...data.participants];
                if (!users.length)
                    return interaction.reply({ content: "❌ No participants.", ephemeral: true });

                const winner = users[Math.floor(Math.random() * users.length)];
                return interaction.reply(`🎉 New winner: <@${winner}>`);
            }
        }

        // ================= DROPDOWN TICKET CREATION =================
        if (interaction.isStringSelectMenu()) {

            if (interaction.customId === "ticket_category") {

                const category = interaction.values[0];

                const existing = interaction.guild.channels.cache.find(c =>
                    c.topic === interaction.user.id);

                if (existing)
                    return interaction.reply({
                        content: `❌ You already have a ticket: ${existing}`,
                        ephemeral: true
                    });

                const roleMap = {
                    general: GENERAL_ROLE_ID,
                    recruit: RECRUIT_ROLE_ID,
                    pirep: PIREP_ROLE_ID,
                    exec: EXEC_ROLE_ID,
                    routes: ROUTES_ROLE_ID
                };

                const roleId = roleMap[category];

                const channel = await interaction.guild.channels.create({
                    name: `${category}-${interaction.user.username}`,
                    type: ChannelType.GuildText,
                    parent: CATEGORY_ID,
                    topic: interaction.user.id,
                    permissionOverwrites: [
                        { id: interaction.guild.roles.everyone, deny: ['ViewChannel'] },
                        { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages'] },
                        { id: roleId, allow: ['ViewChannel', 'SendMessages'] }
                    ]
                });

                const embed = {
                    title: "🎫 Ticket Created",
                    description: `Department: **${category.toUpperCase()}**`,
                    color: 0x00ff00,
                    fields: [
                        { name: "Opened By", value: `<@${interaction.user.id}>`, inline: true },
                        { name: "Claimed By", value: "Not claimed", inline: true }
                    ],
                    timestamp: new Date()
                };

                const buttons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`claim_${roleId}`).setLabel("🙋 Claim").setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 Close").setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId("delete_ticket").setLabel("🗑 Delete").setStyle(ButtonStyle.Danger)
                );

                await channel.send({
                    content: `<@&${roleId}>`,
                    embeds: [embed],
                    components: [buttons]
                });

                interaction.reply({
                    content: `✅ Ticket created: ${channel}`,
                    ephemeral: true
                });
            }
        }

        // ================= BUTTONS =================
        if (interaction.isButton()) {

            // CLAIM
            if (interaction.customId.startsWith("claim_")) {

                const roleId = interaction.customId.split("_")[1];

                if (!interaction.member.roles.cache.has(roleId))
                    return interaction.reply({ content: "❌ Not authorized.", ephemeral: true });

                const embed = interaction.message.embeds[0].toJSON();
                embed.fields[1].value = `<@${interaction.user.id}>`;

                await interaction.message.edit({ embeds: [embed] });

                return interaction.reply({ content: "✅ Ticket claimed.", ephemeral: true });
            }

            // CLOSE
            if (interaction.customId === "close_ticket") {

                if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels))
                    return interaction.reply({ content: "❌ Staff only.", ephemeral: true });

                await interaction.channel.permissionOverwrites.edit(interaction.channel.topic, {
                    SendMessages: false
                });

                return interaction.reply("🔒 Ticket closed.");
            }

            // DELETE
            if (interaction.customId === "delete_ticket") {

                if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels))
                    return interaction.reply({ content: "❌ Staff only.", ephemeral: true });

                await interaction.reply("🗑 Deleting ticket...");
                setTimeout(() => interaction.channel.delete(), 2000);
            }

            // GIVEAWAY JOIN
            if (interaction.customId.startsWith("join_")) {

                const id = interaction.customId.split("_")[1];
                const data = client.giveaways.get(id);

                if (!data)
                    return interaction.reply({ content: "❌ Giveaway ended.", ephemeral: true });

                data.participants.add(interaction.user.id);

                return interaction.reply({ content: "✅ Joined giveaway.", ephemeral: true });
            }
        }

    } catch (error) {
        console.error("Interaction Error:", error);
    }

});

client.login(TOKEN);
