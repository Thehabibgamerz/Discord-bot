// index.js
const { Client, GatewayIntentBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes, ActivityType, PermissionsBitField } = require("discord.js");
const express = require("express");

// --- ENV VARIABLES ---
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID;
const CATEGORY_ID = process.env.CATEGORY_ID; // For private ticket channels
const TICKET_LOG_CHANNEL_ID = process.env.TICKET_LOG_CHANNEL_ID;
const OWNER_ID = process.env.OWNER_ID;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !SUPPORT_ROLE_ID || !CATEGORY_ID || !TICKET_LOG_CHANNEL_ID || !OWNER_ID) {
    console.log("❌ Missing environment variables!");
    process.exit(1);
}

// --- CLIENT ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// --- EXPRESS (for uptime) ---
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
        .setName("createevent")
        .setDescription("Create a new event")
        .addStringOption(opt => opt.setName("title").setDescription("Event title").setRequired(true))
        .addStringOption(opt => opt.setName("description").setDescription("Event description").setRequired(true))
        .addChannelOption(opt => opt.setName("channel").setDescription("Channel to post event").setRequired(true))
        .addStringOption(opt => opt.setName("start").setDescription("Start time YYYY-MM-DD HH:mm").setRequired(true))
        .addStringOption(opt => opt.setName("end").setDescription("End time YYYY-MM-DD HH:mm").setRequired(true))
        .addStringOption(opt => opt.setName("image").setDescription("Optional event image URL"))
        .addStringOption(opt => opt.setName("mention").setDescription("Role ID to mention or 'everyone'")),

    new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Create a giveaway")
        .addStringOption(opt => opt.setName("title").setDescription("Giveaway title").setRequired(true))
        .addStringOption(opt => opt.setName("description").setDescription("Giveaway description").setRequired(true))
        .addStringOption(opt => opt.setName("prize").setDescription("Prize").setRequired(true))
        .addChannelOption(opt => opt.setName("channel").setDescription("Channel to post giveaway").setRequired(true))
        .addStringOption(opt => opt.setName("ends_on").setDescription("End time YYYY-MM-DD HH:mm").setRequired(true))
        .addStringOption(opt => opt.setName("image").setDescription("Optional giveaway image"))
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
client.eventMessages = new Map();
client.giveaways = new Map();

// --- CLIENT READY ---
client.on("ready", () => console.log(`🤖 Logged in as ${client.user.tag}`));

// --- INTERACTION HANDLER ---
client.on("interactionCreate", async interaction => {

    // --- SLASH COMMANDS ---
    if (interaction.isChatInputCommand()) {

        // --- PANEL ---
        if (interaction.commandName === "panel") {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
                return interaction.reply({ content: "❌ Admin only.", ephemeral: true });

            const targetChannel = interaction.options.getChannel("channel");
            if (!targetChannel || targetChannel.type !== ChannelType.GuildText)
                return interaction.reply({ content: "❌ Invalid channel.", ephemeral: true });

            const panelEmbed = {
                title: "QPVA Support Centre!",
                description: `Welcome to the Akasa Air Virtual Support Center! ✈️
Need assistance with Akasa Air services? You’re in the right place! Our dedicated <@&${SUPPORT_ROLE_ID}> is available to help you quickly and efficiently.

Please select a category below to get started, and we’ll connect you with the right support right away.

We’re here to make your journey with Akasa Air smooth and stress-free! 🌍✈️`,
                color: 0x00FF00
            };

            const createBtn = new ButtonBuilder().setCustomId("create_ticket").setLabel("📩 Create a Ticket").setStyle(ButtonStyle.Primary);
            const row = new ActionRowBuilder().addComponents(createBtn);

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

        // --- CREATE EVENT ---
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
            if (isNaN(startDate) || isNaN(endDate))
                return interaction.reply({ content: "❌ Invalid date format. Use YYYY-MM-DD HH:mm", ephemeral: true });

            const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            const startStr = `${startDate.toLocaleDateString('en-US', opts)} at ${startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
            const endStr = `${endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
            const timeFormatted = `${startStr} - ${endStr}`;

            const attendees = new Set();
            const notAttending = new Set();
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("attending_event").setLabel("✅ I'm Attending").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId("cant_attend_event").setLabel("❌ Can't Attend").setStyle(ButtonStyle.Danger)
            );

            const embed = {
                title,
                description,
                color: 0x00FF00,
                image: image ? { url: image } : undefined,
                fields: [
                    { name: "Time", value: timeFormatted, inline: true },
                    { name: "Attending", value: "None", inline: true },
                    { name: "Can't Attend", value: "None", inline: true }
                ]
            };

            const content = mention ? `<@&${mention}>` : null;
            const msg = await channel.send({ content, embeds: [embed], components: [row] });
            client.eventMessages.set(msg.id, { attendees, notAttending });

            return interaction.reply({ content: "✅ Event created!", ephemeral: true });
        }

        // --- GIVEAWAY ---
        if (interaction.commandName === "giveaway") {
            const title = interaction.options.getString("title");
            const description = interaction.options.getString("description");
            const prize = interaction.options.getString("prize");
            const channel = interaction.options.getChannel("channel");
            const image = interaction.options.getString("image");
            const mention = interaction.options.getString("mention") || null;
            const endsOn = interaction.options.getString("ends_on");

            const endDate = new Date(endsOn);
            if (isNaN(endDate)) return interaction.reply({ content: "❌ Invalid date format", ephemeral: true });

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

            const timeout = endDate.getTime() - Date.now();
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
                    fields: [
                        { name: "Prize", value: prize, inline: true },
                        { name: "Winner", value: winnerText }
                    ]
                };
                await msg.edit({ embeds: [endEmbed], components: [] });
                client.giveaways.delete(msg.id);
            }, timeout);

            return interaction.reply({ content: `✅ Giveaway started in ${channel}!`, ephemeral: true });
        }
    }

    // --- BUTTONS ---
    if (interaction.isButton()) {
        const logChannel = interaction.guild.channels.cache.get(TICKET_LOG_CHANNEL_ID);

        // --- TICKET CREATE ---
        if (interaction.customId === "create_ticket") {
            const category = interaction.guild.channels.cache.get(CATEGORY_ID);
            if (!category) return interaction.reply({ content: "❌ Ticket category not found!", ephemeral: true });

            const channel = await interaction.guild.channels.create({
                name: `ticket-${interaction.user.username}`,
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites: [
                    { id: interaction.guild.roles.everyone, deny: ['ViewChannel'] },
                    { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
                    { id: SUPPORT_ROLE_ID, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] }
                ],
                reason: `Ticket created by ${interaction.user.tag}`
            });

            const ticketEmbed = {
                title: "🎫 Support Ticket",
                description: "Thank you for contacting us. A support agent will be with you shortly.",
                color: 0x00FF00,
                fields: [
                    { name: "Opened by", value: `<@${interaction.user.id}>`, inline: true },
                    { name: "Claimed by", value: "None", inline: true }
                ],
                timestamp: new Date()
            };

            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`claim_ticket_${channel.id}`).setLabel("🛡 Claim Ticket").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`close_ticket_${channel.id}`).setLabel("❌ Close Ticket").setStyle(ButtonStyle.Danger)
            );

            await channel.send({ content: `<@&${SUPPORT_ROLE_ID}>`, embeds: [ticketEmbed], components: [buttons] });

            if (logChannel) logChannel.send({ embeds: [{ title: "🎫 Ticket Created", description: `Ticket **${channel.name}** created by <@${interaction.user.id}>`, color: 0x00FF00, timestamp: new Date() }] });

            return interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
        }

        // --- TICKET CLAIM/CLOSE ---
        const [action, type, ticketId] = interaction.customId.split("_");
        const ticketChannel = interaction.guild.channels.cache.get(ticketId);
        if (!ticketChannel) return interaction.reply({ content: "❌ Ticket channel not found.", ephemeral: true });

        if (!interaction.member.roles.cache.has(SUPPORT_ROLE_ID))
            return interaction.reply({ content: "❌ Only staff can perform this action.", ephemeral: true });

        const message = (await ticketChannel.messages.fetch({ limit: 10 })).find(m => m.components.length);
        if (!message) return interaction.reply({ content: "❌ Ticket message not found.", ephemeral: true });
        const embed = message.embeds[0].toJSON();

        if (action === "claim") {
            embed.fields[1].value = `<@${interaction.user.id}>`;
            await message.edit({ embeds: [embed] });
            if (logChannel) logChannel.send({ embeds: [{ title: "🛡 Ticket Claimed", description: `Ticket **${ticketChannel.name}** claimed by <@${interaction.user.id}>`, color: 0xFFFF00, timestamp: new Date() }] });
            return interaction.reply({ content: "✅ You claimed this ticket.", ephemeral: true });
        }

        if (action === "close") {
            // Disable buttons
            const disabledButtons = message.components.map(row => { row.components.forEach(c => c.setDisabled(true)); return row; });
            await message.edit({ components: disabledButtons });

            // Remove user's send permissions
            await ticketChannel.permissionOverwrites.edit(interaction.user.id, { SendMessages: false });
            await ticketChannel.permissionOverwrites.edit(SUPPORT_ROLE_ID, { SendMessages: false });

            if (logChannel) logChannel.send({ embeds: [{ title: "❌ Ticket Closed", description: `Ticket **${ticketChannel.name}** closed by <@${interaction.user.id}>`, color: 0xFF0000, timestamp: new Date() }] });
            return interaction.reply({ content: "✅ Ticket closed.", ephemeral: true });
        }

        // --- EVENT BUTTONS ---
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
            embed.fields[1].value = data.attendees.size > 0 ? [...data.attendees].map(id => `<@${id}>`).join("\n") : "None";
            embed.fields[2].value = data.notAttending.size > 0 ? [...data.notAttending].map(id => `<@${id}>`).join("\n") : "None";
            return interaction.update({ embeds: [embed] });
        }

        // --- GIVEAWAY BUTTONS ---
        if (interaction.customId.startsWith("giveaway_")) {
            const parts = interaction.customId.split("_");
            const msgId = parts[1];
            const action = parts[2];
            const data = client.giveaways.get(msgId);
            if (!data) return interaction.reply({ content: "❌ Giveaway not found.", ephemeral: true });
            if (action === "join") data.participants.add(interaction.user.id);
            else if (action === "leave") data.participants.delete(interaction.user.id);
            const embed = interaction.message.embeds[0].toJSON();
            embed.fields[2].value = data.participants.size > 0 ? [...data.participants].map(id
