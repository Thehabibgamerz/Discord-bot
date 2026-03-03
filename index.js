// =============================
// QPVA SUPPORT BOT - COMPLETE
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

// ================= EXPRESS =================
const app = express();
app.get("/", (req, res) => res.send("Bot Online ✅"));
app.listen(PORT || 3000);

// ================= SLASH COMMANDS =================
const commands = [

    new SlashCommandBuilder()
        .setName("panel")
        .setDescription("Send ticket support panel")
        .addChannelOption(o =>
            o.setName("channel")
             .setDescription("Channel to send panel")
             .setRequired(true))
        .addStringOption(o =>
            o.setName("image")
             .setDescription("Optional image URL for embed")
             .setRequired(false)
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

    // ================= PANEL COMMAND =================
    if (interaction.isChatInputCommand()) {

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

            return interaction.reply({ content: "✅ Support panel sent!", ephemeral: true });
        }
    }

    // ================= CREATE TICKET =================
    if (interaction.isStringSelectMenu()) {

        if (interaction.customId === "ticket_category") {

            const category = interaction.values[0];

            const existing = interaction.guild.channels.cache.find(c =>
                c.topic === interaction.user.id
            );

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
                name: `ticket-${interaction.user.username}`,
                type: ChannelType.GuildText,
                parent: CATEGORY_ID,
                topic: interaction.user.id,
                permissionOverwrites: [
                    {
                        id: interaction.guild.roles.everyone.id,
                        deny: [PermissionsBitField.Flags.ViewChannel]
                    },
                    {
                        id: interaction.user.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages
                        ]
                    },
                    {
                        id: roleId,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages
                        ]
                    }
                ]
            });

            const embed = {
                title: "🎫 Ticket Created",
                description: `Category: **${category.toUpperCase()}**`,
                color: 0x00ff00,
                fields: [
                    { name: "Opened By", value: `<@${interaction.user.id}>`, inline: true },
                    { name: "Claimed By", value: "Not claimed", inline: true }
                ],
                timestamp: new Date()
            };

            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`claim_${roleId}`)
                    .setLabel("🙋 Claim")
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId("close_ticket")
                    .setLabel("🔒 Close")
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId("delete_ticket")
                    .setLabel("🗑 Delete")
                    .setStyle(ButtonStyle.Danger)
            );

            await channel.send({
                content: `<@&${roleId}>`,
                embeds: [embed],
                components: [buttons]
            });

            return interaction.reply({
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
                return interaction.reply({ content: "Not authorized.", ephemeral: true });

            const embed = interaction.message.embeds[0].toJSON();
            embed.fields[1].value = `<@${interaction.user.id}>`;

            await interaction.message.edit({ embeds: [embed] });

            return interaction.reply({ content: "✅ Ticket claimed!", ephemeral: true });
        }

        // CLOSE
        if (interaction.customId === "close_ticket") {

            await interaction.channel.permissionOverwrites.edit(
                interaction.channel.topic,
                { SendMessages: false }
            );

            return interaction.reply("🔒 Ticket closed.");
        }

        // DELETE
        if (interaction.customId === "delete_ticket") {

            await interaction.reply("🗑 Deleting ticket...");
            setTimeout(() => interaction.channel.delete(), 2000);
        }
    }
});

client.login(TOKEN);
