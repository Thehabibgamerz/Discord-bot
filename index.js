// index.js
const { Client, GatewayIntentBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes, ActivityType, PermissionsBitField } = require("discord.js");
const express = require("express");

// --- ENV VARIABLES ---
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID;
const RECRUITER_ROLE_ID = process.env.RECRUITER_ROLE_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;
const TICKET_LOG_CHANNEL_ID = process.env.TICKET_LOG_CHANNEL_ID;
const OWNER_ID = process.env.OWNER_ID;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !SUPPORT_ROLE_ID || !CATEGORY_ID || !TICKET_LOG_CHANNEL_ID || !OWNER_ID || !RECRUITER_ROLE_ID) {
    console.log("❌ Missing environment variables!");
    process.exit(1);
}

// --- CLIENT (safe intents only) ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- EXPRESS (uptime) ---
const app = express();
app.get("/", (req, res) => res.send("Bot is online ✅"));
app.listen(PORT, () => console.log(`🌐 Web server running on ${PORT}`));

// --- SLASH COMMANDS ---
const commands = [
    new SlashCommandBuilder()
        .setName("panel")
        .setDescription("Send the ticket panel")
        .addChannelOption(opt => opt.setName("channel").setDescription("Where to send the panel").setRequired(true))
        .addStringOption(opt => opt.setName("image").setDescription("Optional panel image URL")),

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
        .setName("giveaway")
        .setDescription("Create a giveaway")
        .addStringOption(opt => opt.setName("title").setDescription("Giveaway title").setRequired(true))
        .addStringOption(opt => opt.setName("description").setDescription("Giveaway description").setRequired(true))
        .addStringOption(opt => opt.setName("prize").setDescription("Prize").setRequired(true))
        .addChannelOption(opt => opt.setName("channel").setDescription("Channel to post giveaway").setRequired(true))
        .addStringOption(opt => opt.setName("ends_on").setDescription("End time YYYY-MM-DD HH:mm").setRequired(true))
        .addStringOption(opt => opt.setName("image").setDescription("Optional giveaway image URL"))
        .addStringOption(opt => opt.setName("mention").setDescription("Role ID to mention or 'everyone'"))
].map(cmd => cmd.toJSON());

// --- REGISTER COMMANDS ---
(async () => {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    try {
        console.log("🛠 Registering slash commands...");
        const data = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log(`✅ Registered ${data.length} commands:`, data.map(c => c.name).join(", "));
    } catch (error) {
        console.error("❌ Failed to register commands:", error);
    }
})();

// --- DATA STORAGE ---
client.giveaways = new Map();

// --- CLIENT READY ---
client.on("ready", () => console.log(`🤖 Logged in as ${client.user.tag}`));

// --- INTERACTION HANDLER ---
client.on("interactionCreate", async interaction => {
    if (interaction.isChatInputCommand()) {
        // --- PANEL ---
        if (interaction.commandName === "panel") {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
                return interaction.reply({ content: "❌ Admin only.", ephemeral: true });

            const targetChannel = interaction.options.getChannel("channel");
            const image = interaction.options.getString("image") || null;

            const panelEmbed = {
                title: "QPVA Support Centre!",
                description: `Welcome to the Akasa Air Virtual Support Center! ✈️
Our dedicated <@&${SUPPORT_ROLE_ID}> is ready to help!

Please select a category below to get started.`,
                color: 0x00FF00,
                image: image ? { url: image } : undefined
            };

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("create_general").setLabel("📩 General Support").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("create_recruit").setLabel("📝 Recruitment").setStyle(ButtonStyle.Secondary)
            );

            await targetChannel.send({ embeds: [panelEmbed], components: [row] });
            return interaction.reply({ content: `✅ Panel sent in ${targetChannel}`, ephemeral: true });
        }

        // --- STATUS ---
        if (interaction.commandName === "status") {
            if (interaction.user.id !== OWNER_ID)
                return interaction.reply({ content: "❌ Only bot owner can use this.", ephemeral: true });

            const type = interaction.options.getString("type");
            const text = interaction.options.getString("text");
            let activityType = ActivityType.Playing;
            if (type === "WATCHING") activityType = ActivityType.Watching;
            if (type === "LISTENING") activityType = ActivityType.Listening;
            if (type === "STREAMING") activityType = ActivityType.Streaming;

            client.user.setActivity(text, { type: activityType, url: type === "STREAMING" ? "https://twitch.tv/discord" : undefined });
            return interaction.reply({ content: `✅ Status set to ${type} ${text}`, ephemeral: true });
        }

        // --- GIVEAWAY ---
        if (interaction.commandName === "giveaway") {
            const title = interaction.options.getString("title");
            const description = interaction.options.getString("description");
            const prize = interaction.options.getString("prize");
            const channel = interaction.options.getChannel("channel");
            const image = interaction.options.getString("image") || null;
            const mention = interaction.options.getString("mention") || null;
            const endsOn = interaction.options.getString("ends_on");

            const endDate = new Date(endsOn);
            if (isNaN(endDate)) return interaction.reply({ content: "❌ Invalid date format. Use YYYY-MM-DD HH:mm", ephemeral: true });

            const participants = new Set();
            const embed = {
                title,
                description,
                color: 0xFFD700,
                image: image ? { url: image } : undefined,
                fields: [
                    { name: "Prize", value: prize, inline: true },
                    { name: "Ends On", value: endsOn, inline: true },
                    { name: "Participants", value: "None" }
                ]
            };

            const msg = await channel.send({ content: mention ? `<@&${mention}>` : null, embeds: [embed] });
            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`giveaway_${msg.id}_join`).setLabel("✅ Join").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`giveaway_${msg.id}_leave`).setLabel("❌ Leave").setStyle(ButtonStyle.Danger)
            );
            await msg.edit({ components: [buttons] });
            client.giveaways.set(msg.id, { participants, prize, endsOn });

            setTimeout(async () => {
                const data = client.giveaways.get(msg.id);
                if (!data) return;
                const participantsArr = [...data.participants];
                let winnerText = "No participants!";
                if (participantsArr.length > 0) {
                    const winner = participantsArr[Math.floor(Math.random() * participantsArr.length)];
                    winnerText = `<@${winner}> won the prize! 🎉`;
                }
                const endEmbed = {
                    title: `${title} - Ended`,
                    description,
                    color: 0x00FF00,
                    image: image ? { url: image } : undefined,
                    fields: [
                        { name: "Prize", value: prize, inline: true },
                        { name: "Winner", value: winnerText }
                    ]
                };
                await msg.edit({ embeds: [endEmbed], components: [] });
                client.giveaways.delete(msg.id);
            }, endDate.getTime() - Date.now());

            return interaction.reply({ content: `✅ Giveaway started in ${channel}!`, ephemeral: true });
        }
    }

    // --- BUTTON INTERACTIONS ---
    if (interaction.isButton()) {
        const logChannel = interaction.guild.channels.cache.get(TICKET_LOG_CHANNEL_ID);

        // Handle tickets
        if (interaction.customId === "create_general" || interaction.customId === "create_recruit") {
            const category = interaction.guild.channels.cache.get(CATEGORY_ID);
            const isRecruit = interaction.customId === "create_recruit";
            const channelName = isRecruit ? `recruitment-${interaction.user.username}` : `ticket-${interaction.user.username}`;

            const channel = await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites: [
                    { id: interaction.guild.roles.everyone, deny: ['ViewChannel'] },
                    { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
                    { id: SUPPORT_ROLE_ID, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] }
                ]
            });

            const rolePing = isRecruit ? `<@&${RECRUITER_ROLE_ID}>` : `<@&${SUPPORT_ROLE_ID}>`;

            const ticketEmbed = {
                title: isRecruit ? "📝 Recruitment Ticket" : "🎫 Support Ticket",
                description: isRecruit ? "Thank you for joining! Our Recruitment Team will contact you shortly." :
                                         "Thank you for contacting us. A support agent will be with you shortly.",
                color: isRecruit ? 0x00AAFF : 0x00FF00,
                fields: [
                    { name: "Opened by", value: `<@${interaction.user.id}>`, inline: true },
                    { name: "Claimed by", value: "None", inline: true }
                ],
                timestamp: new Date()
            };

            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`claim_ticket_${channel.id}`).setLabel("🛡 Claim Ticket").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`close_ticket_${channel.id}`).setLabel("❌ Close Ticket").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`reopen_ticket_${channel.id}`).setLabel("♻ Reopen Ticket").setStyle(ButtonStyle.Secondary)
            );

            await channel.send({ content: rolePing, embeds: [ticketEmbed], components: [buttons] });

            if (logChannel) logChannel.send({ embeds: [{ title: isRecruit ? "📝 Recruitment Ticket Created" : "🎫 Ticket Created", description: `Ticket **${channel.name}** created by <@${interaction.user.id}>`, color: isRecruit ? 0x00AAFF : 0x00FF00, timestamp: new Date() }] });

            return interaction.reply({ content: `✅ ${isRecruit ? "Recruitment" : "Support"} ticket created: ${channel}`, ephemeral: true });
        }

        // TODO: claim, close, reopen buttons (similar to previous working version)
    }

    // --- GIVEAWAY BUTTONS ---
    if (interaction.isButton() && interaction.customId.startsWith("giveaway_")) {
        const parts = interaction.customId.split("_");
        const msgId = parts[1];
        const action = parts[2];
        const data = client.giveaways.get(msgId);
        if (!data) return interaction.reply({ content: "❌ Giveaway not found.", ephemeral: true });

        if (action === "join") data.participants.add(interaction.user.id);
        else if (action === "leave") data.participants.delete(interaction.user.id);

        const embed = interaction.message.embeds[0].toJSON();
        embed.fields[2].value = data.participants.size > 0 ? [...data.participants].map(id => `<@${id}>`).join("\n") : "None";
        await interaction.update({ embeds: [embed] });
    }
});

// --- MESSAGE BASED CLOSE COMMAND ---
client.on("messageCreate", async message => {
    if (message.author.bot) return;
    
    if (message.content.toLowerCase() === "!closeticket") {
        const logChannel = message.guild.channels.cache.get(TICKET_LOG_CHANNEL_ID);

        if (!message.member.roles.cache.has(SUPPORT_ROLE_ID)) return message.reply("❌ Only staff can close tickets.");
        if (!message.channel.name.startsWith("ticket-") && !message.channel.name.startsWith("recruitment-")) return message.reply("❌ This is not a ticket channel.");

        const ticketMessage = (await message.channel.messages.fetch({ limit: 10 })).find(m => m.components.length);
        if (ticketMessage) {
            const disabled = ticketMessage.components.map(row => { row.components.forEach(c => c.setDisabled(true)); return row; });
            await ticketMessage.edit({ components: disabled });
        }

        const embed = ticketMessage?.embeds[0];
        if (embed) {
            const ticketUserId = embed.fields[0].value.replace(/[<@!>]/g, "");
            await message.channel.permissionOverwrites.edit(ticketUserId, { SendMessages: false });
            await message.channel.permissionOverwrites.edit(SUPPORT_ROLE_ID, { SendMessages: false });
        }

        if (logChannel) logChannel.send({ embeds: [{ title: "❌ Ticket Closed", description: `Ticket **${message.channel.name}** closed by <@${message.author.id}>`, color: 0xFF0000, timestamp: new Date() }] });

        return message.reply("✅ Ticket closed successfully.");
    }
});

client.login(TOKEN);
