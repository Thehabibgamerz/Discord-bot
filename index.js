const { 
  Client, GatewayIntentBits, PermissionsBitField,
  REST, Routes,
  SlashCommandBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, ChannelType, ActivityType 
} = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const OWNER_ID = process.env.OWNER_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;

// Role IDs
const GENERAL_ROLE_ID = process.env.GENERAL_ROLE_ID;
const RECRUITER_ROLE_ID = process.env.RECRUITER_ROLE_ID;
const EXEC_ROLE_ID = process.env.EXEC_ROLE_ID;
const PIREP_ROLE_ID = process.env.PIREP_ROLE_ID;

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Ticket storage
let ticketCounter = 0;
const activeTickets = new Map(); // userId => channelId
const ticketData = new Map(); // channelId => ticket info

// Event storage
const events = new Map(); // messageId -> { title, description, time, attendees, channel, embed }

/* ================= SLASH COMMANDS ================= */
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Make the bot say something')
    .addStringOption(opt => opt.setName('text').setDescription('Message').setRequired(true))
    .addChannelOption(opt => opt.setName('channel').setDescription('Optional channel')),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member')
    .addUserOption(opt => opt.setName('user').setDescription('User to kick').setRequired(true)),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member')
    .addUserOption(opt => opt.setName('user').setDescription('User to ban').setRequired(true)),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Set bot status (owner only)')
    .addStringOption(opt => opt.setName('type').setDescription('Status type').setRequired(true)
      .addChoices({ name: "Playing", value: "PLAYING" }, { name: "Watching", value: "WATCHING" }, { name: "Listening", value: "LISTENING" }, { name: "Streaming", value: "STREAMING" }))
    .addStringOption(opt => opt.setName('text').setDescription('Status text').setRequired(true)),
  new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Send the ticket panel')
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel to send panel').setRequired(true))
    .addStringOption(opt => opt.setName('image').setDescription('Optional panel image URL')),
  new SlashCommandBuilder()
    .setName('closeticket').setDescription('Close your ticket'),
  new SlashCommandBuilder()
    .setName('reopenticket').setDescription('Reopen a closed ticket'),
  new SlashCommandBuilder()
    .setName('deleteticket').setDescription('Delete your ticket'),
  new SlashCommandBuilder()
    .setName('ticketuser')
    .setDescription('Add or remove a user from a ticket')
    .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
    .addStringOption(opt => opt.setName('action').setDescription('Add or remove').setRequired(true).addChoices({name:'Add', value:'add'}, {name:'Remove', value:'remove'})),
  new SlashCommandBuilder()
    .setName('event')
    .setDescription('Create a new event')
    .addStringOption(opt => opt.setName('title').setDescription('Event title').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Event description').setRequired(true))
    .addStringOption(opt => opt.setName('time').setDescription('Event time YYYY-MM-DD HH:mm').setRequired(true))
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post event').setRequired(true))
    .addStringOption(opt => opt.setName('image').setDescription('Optional image URL'))
    .addStringOption(opt => opt.setName('mention').setDescription('Role ID to mention'))
].map(cmd => cmd.toJSON());

/* ================= REGISTER COMMANDS ================= */
(async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log("✅ Commands registered");
})();

/* ================= READY ================= */
client.once('ready', () => console.log(`✅ Logged in as ${client.user.tag}`));

/* ================= HELPER: format SESh time ================= */
function formatSEShTime(date) {
  return date.toLocaleString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:true });
}

/* ================= INTERACTION HANDLER ================= */
client.on('interactionCreate', async interaction => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.commandName;

      // Old commands
      if (cmd === 'ping') return interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);

      if (cmd === 'say') {
        const text = interaction.options.getString('text');
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        await channel.send(text);
        return interaction.reply({ content: `✅ Message sent to ${channel}`, ephemeral:true });
      }

      if (cmd === 'kick') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return interaction.reply({content:'❌ No permission', ephemeral:true});
        const user = interaction.options.getUser('user');
        const member = interaction.guild.members.cache.get(user.id);
        if (member) { await member.kick(); return interaction.reply(`👢 Kicked ${user.tag}`); }
      }

      if (cmd === 'ban') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply({content:'❌ No permission', ephemeral:true});
        const user = interaction.options.getUser('user');
        const member = interaction.guild.members.cache.get(user.id);
        if (member) { await member.ban(); return interaction.reply(`🔨 Banned ${user.tag}`); }
      }

      if (cmd === 'status') {
        if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '❌ Only owner', ephemeral:true });
        const type = interaction.options.getString('type');
        const text = interaction.options.getString('text');
        let act = ActivityType.Playing;
        if (type==="WATCHING") act = ActivityType.Watching;
        if (type==="LISTENING") act = ActivityType.Listening;
        if (type==="STREAMING") act = ActivityType.Streaming;
        client.user.setActivity(text, {type:act});
        return interaction.reply({content:`✅ Status set to ${type} ${text}`, ephemeral:true});
      }

      // Ticket Panel
      if (cmd==='ticketpanel') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({content:'❌ Admin only', ephemeral:true});
        const channel = interaction.options.getChannel('channel');
        const image = interaction.options.getString('image');
        const embed = new EmbedBuilder()
          .setTitle("🎫 QPVA Support Centre ✈️")
          .setDescription(`Welcome to the Akasa Air Virtual Support Center!
Need assistance with any Akasa Air service? You’re in the right place! Our dedicated <@&${GENERAL_ROLE_ID}> is here to help you quickly and efficiently.

Please select a category below to create a ticket:

- General Support
- Recruitments
- Executive Team Support
- PIREP Support

We’re committed to making your journey with Akasa Air smooth and stress-free! 🌍✈️`)
          .setColor(0xff6600)
          .setImage(image || null);

        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("ticket_select")
            .setPlaceholder("🎟 Select a support category")
            .addOptions([
              { label:"General Support", value:"general" },
              { label:"Recruitments", value:"recruit" },
              { label:"Executive Team Support", value:"exec" },
              { label:"PIREP Support", value:"pirep" }
            ])
        );

        await channel.send({embeds:[embed], components:[row]});
        return interaction.reply({content:'✅ Ticket panel sent', ephemeral:true});
      }

      // Ticket management commands: closeticket, reopenticket, deleteticket, ticketuser
      const ticketCmds = ['closeticket','reopenticket','deleteticket','ticketuser'];
      if (ticketCmds.includes(cmd)) {
        const data = ticketData.get(interaction.channel.id);
        if (!data) return interaction.reply({ content:"❌ Not a ticket channel", ephemeral:true });

        if (cmd==='closeticket') {
          await interaction.channel.permissionOverwrites.edit(data.openedBy, { SendMessages:false });
          return interaction.reply({content:'🔒 Ticket closed', ephemeral:true});
        }
        if (cmd==='reopenticket') {
          await interaction.channel.permissionOverwrites.edit(data.openedBy, { SendMessages:true });
          return interaction.reply({content:'✅ Ticket reopened', ephemeral:true});
        }
        if (cmd==='deleteticket') {
          ticketData.delete(interaction.channel.id);
          activeTickets.delete(data.openedBy);
          await interaction.channel.delete();
        }
        if (cmd==='ticketuser') {
          const user = interaction.options.getUser('user');
          const action = interaction.options.getString('action');
          if (action==='add') await interaction.channel.permissionOverwrites.edit(user.id,{ViewChannel:true,SendMessages:true});
          if (action==='remove') await interaction.channel.permissionOverwrites.edit(user.id,{ViewChannel:false,SendMessages:false});
          return interaction.reply({content:`✅ User ${action}ed`, ephemeral:true});
        }
      }

      // Event creation
      if (cmd==='event') {
        const title = interaction.options.getString('title');
        const desc = interaction.options.getString('description');
        const timeStr = interaction.options.getString('time');
        const ch = interaction.options.getChannel('channel');
        const image = interaction.options.getString('image');
        const mention = interaction.options.getString('mention');
        const eventTime = new Date(timeStr);
        if (isNaN(eventTime)) return interaction.reply({content:'❌ Invalid time format', ephemeral:true});
        const attendees = new Set();
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(desc)
          .addFields({name:'Time', value:formatSEShTime(eventTime)}, {name:'Attending', value:'None'})
          .setColor(0x00FF00)
          .setImage(image || null);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('attend_event').setLabel("✅ I'm attending").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('remove_event').setLabel("❌ Remove Me").setStyle(ButtonStyle.Danger)
        );

        const msg = await ch.send({content:mention?`<@&${mention}>`:null, embeds:[embed], components:[row]});
        events.set(msg.id,{title,description:desc,time:eventTime,attendees,ch,embed});
        return interaction.reply({content:`✅ Event created in ${ch}`, ephemeral:true});
      }
    }

    // --- Button interactions ---
    if (interaction.isButton()) {
      // Event buttons
      const event = events.get(interaction.message.id);
      if (event) {
        const userId = interaction.user.id;
        if (interaction.customId==='attend_event') event.attendees.add(userId);
        if (interaction.customId==='remove_event') event.attendees.delete(userId);
        const list = event.attendees.size>0?[...event.attendees].map(id=>`<@${id}>`).join("\n"):'None';
        const embed = EmbedBuilder.from(event.embed).spliceFields(1,1,{name:'Attending', value:list});
        return interaction.update({embeds:[embed]});
      }

      // Ticket category select menu
      if (interaction.isStringSelectMenu() && interaction.customId==='ticket_select') {
        if (activeTickets.has(interaction.user.id)) return interaction.reply({content:'❌ You already have a ticket', ephemeral:true});
        await interaction.deferReply({ephemeral:true});
        ticketCounter++;
        const ticketNumber = String(ticketCounter).padStart(3,'0');

        const categories = { general:{name:'General Support', role:GENERAL_ROLE_ID}, recruit:{name:'Recruitments', role:RECRUITER_ROLE_ID}, exec:{name:'Executive Team Support', role:EXEC_ROLE_ID}, pirep:{name:'PIREP Support', role:PIREP_ROLE_ID} };
        const sel = categories[interaction.values[0]];

        const ch = await interaction.guild.channels.create({ name:`ticket-${ticketNumber}`, type:ChannelType.GuildText, parent:CATEGORY_ID, permissionOverwrites:[
          { id:interaction.guild.roles.everyone.id, deny:[PermissionsBitField.Flags.ViewChannel] },
          { id:interaction.user.id, allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages] },
          { id:sel.role, allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages] }
        ]});

        activeTickets.set(interaction.user.id,ch.id);
        ticketData.set(ch.id,{category:sel.name, openedBy:interaction.user.id, claimedBy:null});

        const embed = new EmbedBuilder()
          .setTitle(sel.name)
          .setDescription('Thanks for creating a ticket! Our staff team will contact you shortly.')
          .addFields({name:'Opened by', value:`<@${interaction.user.id}>`},{name:'Claimed by', value:'Not claimed yet'})
          .setColor(0x2ecc71);

        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('remove_user').setLabel('Remove User').setStyle(ButtonStyle.Secondary)
        );

        await ch.send({content:`<@&${sel.role}>`, embeds:[embed], components:[buttons]});
        return interaction.editReply({content:`🎟 Ticket created: ${ch}`});
      }
    }

  } catch(err){ console.error(err); }
});

client.login(TOKEN);
