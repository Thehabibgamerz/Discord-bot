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
    AttachmentBuilder
} = require("discord.js");

const express = require("express");
const fs = require("fs");
const path = require("path");

// ================= ENV =================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;
const TICKET_LOG_CHANNEL_ID = process.env.TICKET_LOG_CHANNEL_ID;
const OWNER_ID = process.env.OWNER_ID;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !SUPPORT_ROLE_ID || !CATEGORY_ID || !TICKET_LOG_CHANNEL_ID || !OWNER_ID) {
    console.log("❌ Missing environment variables!");
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

// ================= EXPRESS =================
const app = express();
app.get("/", (req, res) => res.send("Bot is online ✅"));
app.listen(PORT, () => console.log(`🌐 Web server running on ${PORT}`));

// ================= SLASH COMMANDS =================
const commands = [

    new SlashCommandBuilder()
        .setName("panel")
        .setDescription("Send the ticket panel")
        .addChannelOption(opt =>
            opt.setName("channel").setDescription("Channel").setRequired(true)),

    new SlashCommandBuilder()
        .setName("close")
        .setDescription("Close this ticket"),

    new SlashCommandBuilder()
        .setName("add")
        .setDescription("Add user to ticket")
        .addUserOption(opt =>
            opt.setName("user").setDescription("User").setRequired(true)),

    new SlashCommandBuilder()
        .setName("remove")
        .setDescription("Remove user from ticket")
        .addUserOption(opt =>
            opt.setName("user").setDescription("User").setRequired(true)),

    new SlashCommandBuilder()
        .setName("say")
        .setDescription("Make bot say something")
        .addChannelOption(opt =>
            opt.setName("channel").setDescription("Channel").setRequired(true))
        .addStringOption(opt =>
            opt.setName("message").setDescription("Message").setRequired(true)),

    new SlashCommandBuilder()
        .setName("status")
        .setDescription("Change bot status (Owner only)")
        .addStringOption(opt =>
            opt.setName("type")
                .setDescription("Status type")
                .setRequired(true)
                .addChoices(
                    { name: "Playing", value: "PLAYING" },
                    { name: "Watching", value: "WATCHING" },
                    { name: "Listening", value: "LISTENING" },
                    { name: "Streaming", value: "STREAMING" }
                ))
        .addStringOption(opt =>
            opt.setName("text").setDescription("Status text").setRequired(true)),

    new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Create giveaway")
        .addStringOption(o => o.setName("title").setDescription("Title").setRequired(true))
        .addStringOption(o => o.setName("description").setDescription("Description").setRequired(true))
        .addStringOption(o => o.setName("prize").setDescription("Prize").setRequired(true))
        .addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true))
        .addIntegerOption(o => o.setName("duration").setDescription("Duration in minutes").setRequired(true)),

    new SlashCommandBuilder()
        .setName("reroll")
        .setDescription("Reroll giveaway winner")
        .addStringOption(o =>
            o.setName("message_id").setDescription("Giveaway message ID").setRequired(true))

].map(c => c.toJSON());

(async () => {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
})();

// ================= READY =================
client.on("ready", () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
});

// ================= INTERACTIONS =================
client.on("interactionCreate", async interaction => {

    // ================= SLASH =================
    if (interaction.isChatInputCommand()) {

        // PANEL
        if (interaction.commandName === "panel") {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
                return interaction.reply({ content: "❌ Admin only.", ephemeral: true });

            const channel = interaction.options.getChannel("channel");

            const embed = {
                title: "🎫 Support Center",
                description: "Click below to create a support ticket.",
                color: 0x00ff00
            };

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("create_ticket")
                    .setLabel("📩 Create Ticket")
                    .setStyle(ButtonStyle.Primary)
            );

            await channel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: "✅ Panel sent.", ephemeral: true });
        }

        // CLOSE
        if (interaction.commandName === "close") {
            if (!interaction.channel.name.startsWith("ticket-"))
                return interaction.reply({ content: "❌ Not a ticket.", ephemeral: true });

            if (!interaction.member.roles.cache.has(SUPPORT_ROLE_ID))
                return interaction.reply({ content: "❌ Staff only.", ephemeral: true });

            await interaction.reply("🔒 Closing ticket...");

            const messages = await interaction.channel.messages.fetch({ limit: 100 });
            const transcript = messages.reverse().map(m =>
                `[${m.author.tag}] ${m.content}`).join("\n");

            const filePath = path.join(__dirname, `${interaction.channel.name}.html`);
            fs.writeFileSync(filePath, `<pre>${transcript}</pre>`);

            const logChannel = interaction.guild.channels.cache.get(TICKET_LOG_CHANNEL_ID);
            if (logChannel) {
                await logChannel.send({
                    content: `📜 Transcript for ${interaction.channel.name}`,
                    files: [new AttachmentBuilder(filePath)]
                });
            }

            setTimeout(() => interaction.channel.delete(), 3000);
        }

        // ADD
        if (interaction.commandName === "add") {
            const user = interaction.options.getUser("user");
            await interaction.channel.permissionOverwrites.edit(user.id, {
                ViewChannel: true,
                SendMessages: true
            });
            interaction.reply(`✅ Added ${user}`);
        }

        // REMOVE
        if (interaction.commandName === "remove") {
            const user = interaction.options.getUser("user");
            await interaction.channel.permissionOverwrites.delete(user.id);
            interaction.reply(`✅ Removed ${user}`);
        }

        // SAY
        if (interaction.commandName === "say") {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
                return interaction.reply({ content: "❌ Admin only.", ephemeral: true });

            const channel = interaction.options.getChannel("channel");
            const message = interaction.options.getString("message");
            await channel.send(message);
            interaction.reply({ content: "✅ Sent.", ephemeral: true });
        }

        // STATUS
        if (interaction.commandName === "status") {
            if (interaction.user.id !== OWNER_ID)
                return interaction.reply({ content: "❌ Owner only.", ephemeral: true });

            const type = interaction.options.getString("type");
            const text = interaction.options.getString("text");

            let activityType = ActivityType.Playing;
            if (type === "WATCHING") activityType = ActivityType.Watching;
            if (type === "LISTENING") activityType = ActivityType.Listening;
            if (type === "STREAMING") activityType = ActivityType.Streaming;

            client.user.setActivity(text, { type: activityType });
            interaction.reply({ content: "✅ Status updated.", ephemeral: true });
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

            client.giveaways.set(msg.id, { participants, prize });

            setTimeout(async () => {
                const data = client.giveaways.get(msg.id);
                if (!data) return;

                const users = [...data.participants];
                const winner = users.length ? users[Math.floor(Math.random() * users.length)] : null;

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

            interaction.reply({ content: "✅ Giveaway started.", ephemeral: true });
        }

        // REROLL
        if (interaction.commandName === "reroll") {
            const id = interaction.options.getString("message_id");
            const data = client.giveaways.get(id);
            if (!data) return interaction.reply({ content: "❌ Not found.", ephemeral: true });

            const users = [...data.participants];
            if (!users.length)
                return interaction.reply({ content: "❌ No participants.", ephemeral: true });

            const winner = users[Math.floor(Math.random() * users.length)];
            interaction.reply(`🎉 New winner: <@${winner}>`);
        }
    }

    // ================= BUTTON =================
    if (interaction.isButton()) {

        // CREATE TICKET
        if (interaction.customId === "create_ticket") {

            if (interaction.guild.channels.cache.find(c =>
                c.name === `ticket-${interaction.user.id}`))
                return interaction.reply({ content: "❌ You already have a ticket.", ephemeral: true });

            const channel = await interaction.guild.channels.create({
                name: `ticket-${interaction.user.id}`,
                type: ChannelType.GuildText,
                parent: CATEGORY_ID,
                permissionOverwrites: [
                    { id: interaction.guild.roles.everyone, deny: ['ViewChannel'] },
                    { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages'] },
                    { id: SUPPORT_ROLE_ID, allow: ['ViewChannel', 'SendMessages'] }
                ]
            });

            await channel.send(`<@&${SUPPORT_ROLE_ID}> Ticket opened by <@${interaction.user.id}>`);

            interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
        }

        // JOIN GIVEAWAY
        if (interaction.customId.startsWith("join_")) {
            const id = interaction.customId.split("_")[1];
            const data = client.giveaways.get(id);
            if (!data) return interaction.reply({ content: "❌ Ended.", ephemeral: true });

            data.participants.add(interaction.user.id);

            interaction.reply({ content: "✅ Joined giveaway.", ephemeral: true });
        }
    }
});

client.login(TOKEN);
