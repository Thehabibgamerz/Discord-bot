// bot.js
const { Client, GatewayIntentBits, Partials, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, EmbedBuilder } = require('discord.js');
require('dotenv').config();

const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID;
const RECRUITER_ROLE_ID = process.env.RECRUITER_ROLE_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;
const TICKET_LOG_CHANNEL_ID = process.env.TICKET_LOG_CHANNEL_ID;

if(!TOKEN || !GUILD_ID || !SUPPORT_ROLE_ID || !RECRUITER_ROLE_ID || !CATEGORY_ID || !TICKET_LOG_CHANNEL_ID){
    console.log('❌ Missing environment variables!');
    process.exit(1);
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel, Partials.Message]
});

// READY
client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

// ---------- STATUS COMMAND ----------
client.on('interactionCreate', async interaction => {
    if(!interaction.isChatInputCommand()) return;
    if(interaction.commandName === 'status'){
        await interaction.reply({ content: '🟢 I am online!', ephemeral: true });
    }
});

// ---------- TICKET BUTTON HANDLER ----------
client.on('interactionCreate', async interaction => {
    if(!interaction.isButton()) return;

    const logChannel = interaction.guild.channels.cache.get(TICKET_LOG_CHANNEL_ID);
    const category = interaction.guild.channels.cache.get(CATEGORY_ID);

    // CREATE TICKET
    if(interaction.customId === 'create_general' || interaction.customId === 'create_recruit'){
        const isRecruit = interaction.customId === 'create_recruit';
        const channelName = isRecruit ? `recruitment-${interaction.user.username}` : `ticket-${interaction.user.username}`;

        const ticketChannel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: [
                { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: SUPPORT_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ]
        });

        const rolePing = isRecruit ? `<@&${RECRUITER_ROLE_ID}>` : `<@&${SUPPORT_ROLE_ID}>`;
        const embed = new EmbedBuilder()
            .setTitle(isRecruit ? '📝 Recruitment Ticket' : '🎫 Support Ticket')
            .setDescription(isRecruit ? 'Thank you! Our Recruitment Team will contact you shortly.' : 'Thank you for contacting us. A support agent will be with you shortly.')
            .addFields(
                { name: 'Opened by', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Claimed by', value: 'None', inline: true }
            )
            .setColor(isRecruit ? 0x00AAFF : 0x00FF00)
            .setTimestamp();

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`claim_${ticketChannel.id}`).setLabel('🛡 Claim Ticket').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`close_${ticketChannel.id}`).setLabel('❌ Close Ticket').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`reopen_${ticketChannel.id}`).setLabel('♻ Reopen Ticket').setStyle(ButtonStyle.Secondary)
        );

        await ticketChannel.send({ content: rolePing, embeds: [embed], components: [buttons] });

        if(logChannel) logChannel.send({ embeds: [
            new EmbedBuilder()
                .setTitle(isRecruit ? '📝 Recruitment Ticket Created' : '🎫 Ticket Created')
                .setDescription(`Ticket **${ticketChannel.name}** created by <@${interaction.user.id}>`)
                .setColor(isRecruit ? 0x00AAFF : 0x00FF00)
                .setTimestamp()
        ]});

        return interaction.reply({ content: `✅ ${isRecruit ? 'Recruitment' : 'Support'} ticket created: ${ticketChannel}`, ephemeral: true });
    }

    // BUTTON ACTIONS
    const [action, channelId] = interaction.customId.split('_');
    const ticketChannel = interaction.guild.channels.cache.get(channelId);
    if(!ticketChannel) return interaction.reply({ content: '❌ Ticket channel not found.', ephemeral: true });

    const ticketMessage = (await ticketChannel.messages.fetch({ limit: 10 })).find(m => m.components.length);
    if(!ticketMessage) return interaction.reply({ content: '❌ Ticket message not found.', ephemeral: true });

    const embed = ticketMessage.embeds[0].toJSON();

    // CLAIM
    if(action === 'claim'){
        if(!interaction.member.roles.cache.has(SUPPORT_ROLE_ID)) return interaction.reply({ content: '❌ Only staff can claim tickets.', ephemeral: true });
        embed.fields[1].value = `<@${interaction.user.id}>`;
        await ticketMessage.edit({ embeds: [embed] });
        return interaction.reply({ content: '✅ You claimed this ticket.', ephemeral: true });
    }

    // CLOSE
    if(action === 'close'){
        if(!interaction.member.roles.cache.has(SUPPORT_ROLE_ID)) return interaction.reply({ content: '❌ Only staff can close tickets.', ephemeral: true });

        const disabled = ticketMessage.components.map(row => { row.components.forEach(c => c.setDisabled(true)); return row; });
        await ticketMessage.edit({ components: disabled });

        await ticketChannel.permissionOverwrites.edit(ticketChannel.guild.roles.everyone.id, { ViewChannel: false });
        await ticketChannel.permissionOverwrites.edit(SUPPORT_ROLE_ID, { SendMessages: false });

        if(logChannel) logChannel.send({ embeds: [
            new EmbedBuilder()
                .setTitle('❌ Ticket Closed')
                .setDescription(`Ticket **${ticketChannel.name}** closed by <@${interaction.user.id}>`)
                .setColor(0xFF0000)
                .setTimestamp()
        ]});

        return interaction.reply({ content: '✅ Ticket closed successfully.', ephemeral: true });
    }

    // REOPEN
    if(action === 'reopen'){
        if(!interaction.member.roles.cache.has(SUPPORT_ROLE_ID)) return interaction.reply({ content: '❌ Only staff can reopen tickets.', ephemeral: true });

        const enabled = ticketMessage.components.map(row => { row.components.forEach(c => c.setDisabled(false)); return row; });
        await ticketMessage.edit({ components: enabled });

        const openerId = embed.fields[0].value.replace(/[<@!>]/g,'');
        await ticketChannel.permissionOverwrites.edit(openerId, { SendMessages: true, ViewChannel: true });
        await ticketChannel.permissionOverwrites.edit(SUPPORT_ROLE_ID, { SendMessages: true, ViewChannel: true });

        if(logChannel) logChannel.send({ embeds: [
            new EmbedBuilder()
                .setTitle('♻ Ticket Reopened')
                .setDescription(`Ticket **${ticketChannel.name}** reopened by <@${interaction.user.id}>`)
                .setColor(0x00FF00)
                .setTimestamp()
        ]});

        return interaction.reply({ content: '✅ Ticket reopened successfully.', ephemeral: true });
    }
});

// ---------- GIVEAWAY COMMAND ----------
client.on('interactionCreate', async interaction => {
    if(!interaction.isChatInputCommand()) return;
    if(interaction.commandName === 'giveaway'){
        const title = interaction.options.getString('title');
        const desc = interaction.options.getString('description');
        const prize = interaction.options.getString('prize');
        const endsOn = interaction.options.getString('ends_on');

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(`${desc}\n\n🎁 Prize: ${prize}\n⏰ Ends on: ${endsOn}`)
            .setColor(0xFFD700)
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('enter_giveaway').setLabel('🎉 Enter Giveaway').setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }
});

// ---------- STATUS COMMAND ----------
client.on('interactionCreate', async interaction => {
    if(!interaction.isChatInputCommand()) return;
    if(interaction.commandName === 'status'){
        await interaction.reply({ content: '🟢 Bot is online!', ephemeral: true });
    }
});

client.login(TOKEN);
