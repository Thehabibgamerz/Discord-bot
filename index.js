const { 
  Client, GatewayIntentBits, PermissionsBitField,
  REST, Routes,
  SlashCommandBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, ChannelType, ActivityType 
} = require('discord.js');

const fetch = require('node-fetch'); // Required for ATIS

/* ===== ENV ===== */
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const OWNER_ID = process.env.OWNER_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;
const IF_API_KEY = process.env.IF_API_KEY; // Infinite Flight API Key

// Roles
const GENERAL_ROLE_ID = process.env.GENERAL_ROLE_ID;
const RECRUITER_ROLE_ID = process.env.RECRUITER_ROLE_ID;
const EXEC_ROLE_ID = process.env.EXEC_ROLE_ID;
const PIREP_ROLE_ID = process.env.PIREP_ROLE_ID;

const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent
]});

/* ===== DATA STORAGE ===== */
let ticketCounter = 0;
const activeTickets = new Map(); // userId -> channelId
const ticketData = new Map(); // channelId -> {openedBy, claimedBy, category}

const events = new Map(); // messageId -> {title, description, time, attendees, channel, embed}
const giveaways = new Map(); // messageId -> {participants, prize, endsOn}

/* ===== HELPERS ===== */
function formatSEShTime(date){
  return date.toLocaleString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:true });
}

/* ===== SLASH COMMANDS ===== */
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
      .addChoices(
        {name:"Playing", value:"PLAYING"},
        {name:"Watching", value:"WATCHING"},
        {name:"Listening", value:"LISTENING"},
        {name:"Streaming", value:"STREAMING"}
      ))
    .addStringOption(opt => opt.setName('text').setDescription('Status text').setRequired(true)),
  new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Send the ticket panel')
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel to send panel').setRequired(true))
    .addStringOption(opt => opt.setName('image').setDescription('Optional panel image URL')),
  new SlashCommandBuilder()
    .setName('event')
    .setDescription('Create a new event')
    .addStringOption(opt => opt.setName('title').setDescription('Event title').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Event description').setRequired(true))
    .addStringOption(opt => opt.setName('time').setDescription('Event time YYYY-MM-DD HH:mm').setRequired(true))
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post event').setRequired(true))
    .addStringOption(opt => opt.setName('image').setDescription('Optional image URL'))
    .addStringOption(opt => opt.setName('mention').setDescription('Role ID to mention')),
  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Create a giveaway')
    .addStringOption(opt => opt.setName('title').setDescription('Title').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Description').setRequired(true))
    .addStringOption(opt => opt.setName('prize').setDescription('Prize').setRequired(true))
    .addStringOption(opt => opt.setName('ends_on').setDescription('End time YYYY-MM-DD HH:mm').setRequired(true))
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post giveaway').setRequired(true))
    .addStringOption(opt => opt.setName('mention').setDescription('Role to mention or everyone')),
  new SlashCommandBuilder()
    .setName('atis')
    .setDescription('Get live ATIS from Infinite Flight')
    .addStringOption(opt => opt.setName('icao').setDescription('Airport ICAO code').setRequired(true))
    .addStringOption(opt => opt.setName('server').setDescription('Server: casual, training, expert').setRequired(true))
].map(cmd=>cmd.toJSON());

/* ===== REGISTER COMMANDS ===== */
(async ()=>{
  const rest = new REST({version:'10'}).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID), {body:commands});
  console.log("✅ Slash commands registered");
})();

/* ===== READY ===== */
client.once('ready', ()=>console.log(`🤖 Logged in as ${client.user.tag}`));

/* ===== INTERACTION HANDLER ===== */
client.on('interactionCreate', async interaction=>{
  try{
    if(interaction.isChatInputCommand()){
      const cmd = interaction.commandName;

      /* ===== OLD COMMANDS ===== */
      if(cmd==='ping') return interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);

      if(cmd==='say'){
        const text = interaction.options.getString('text');
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        await channel.send(text);
        return interaction.reply({content:`✅ Message sent to ${channel}`, ephemeral:true});
      }

      if(cmd==='kick'){
        if(!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return interaction.reply({content:'❌ No permission', ephemeral:true});
        const user = interaction.options.getUser('user');
        const member = interaction.guild.members.cache.get(user.id);
        if(member){ await member.kick(); return interaction.reply(`👢 Kicked ${user.tag}`);}
      }

      if(cmd==='ban'){
        if(!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply({content:'❌ No permission', ephemeral:true});
        const user = interaction.options.getUser('user');
        const member = interaction.guild.members.cache.get(user.id);
        if(member){ await member.ban(); return interaction.reply(`🔨 Banned ${user.tag}`);}
      }

      if(cmd==='status'){
        if(interaction.user.id!==OWNER_ID) return interaction.reply({content:'❌ Only owner', ephemeral:true});
        const type = interaction.options.getString('type');
        const text = interaction.options.getString('text');
        let act = ActivityType.Playing;
        if(type==='WATCHING') act=ActivityType.Watching;
        if(type==='LISTENING') act=ActivityType.Listening;
        if(type==='STREAMING') act=ActivityType.Streaming;
        client.user.setActivity(text,{type:act});
        return interaction.reply({content:`✅ Status set: ${type} ${text}`, ephemeral:true});
      }

      /* ===== TICKET PANEL ===== */
      if(cmd==='ticketpanel'){
        if(!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({content:'❌ Admin only', ephemeral:true});
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
            .setCustomId('ticket_select')
            .setPlaceholder('🎟 Select a category')
            .addOptions([
              {label:'General Support', value:'general'},
              {label:'Recruitments', value:'recruit'},
              {label:'Executive Team Support', value:'exec'},
              {label:'PIREP Support', value:'pirep'}
            ])
        );

        await channel.send({embeds:[embed], components:[row]});
        return interaction.reply({content:'✅ Ticket panel sent', ephemeral:true});
      }

      /* ===== EVENT ===== */
      if(cmd==='event'){
        const title = interaction.options.getString('title');
        const desc = interaction.options.getString('description');
        const timeStr = interaction.options.getString('time');
        const ch = interaction.options.getChannel('channel');
        const img = interaction.options.getString('image');
        const mention = interaction.options.getString('mention');

        const eventTime = new Date(timeStr);
        if(isNaN(eventTime)) return interaction.reply({content:'❌ Invalid time', ephemeral:true});
        const attendees = new Set();

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(desc)
          .addFields({name:'Time', value:formatSEShTime(eventTime)}, {name:'Attending', value:'None'})
          .setColor(0x00FF00)
          .setImage(img||null);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('attend_event').setLabel("✅ I'm attending").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('remove_event').setLabel("❌ Remove Me").setStyle(ButtonStyle.Danger)
        );

        const msg = await ch.send({content:mention?`<@&${mention}>`:null, embeds:[embed], components:[row]});
        events.set(msg.id,{title,description:desc,time:eventTime,attendees,ch,embed});
        return interaction.reply({content:`✅ Event created in ${ch}`, ephemeral:true});
      }

      /* ===== GIVEAWAY ===== */
      if(cmd==='giveaway'){
        const title = interaction.options.getString('title');
        const desc = interaction.options.getString('description');
        const prize = interaction.options.getString('prize');
        const endsOnStr = interaction.options.getString('ends_on');
        const ch = interaction.options.getChannel('channel');
        const mention = interaction.options.getString('mention');

        const endTime = new Date(endsOnStr);
        if(isNaN(endTime)) return interaction.reply({content:'❌ Invalid time', ephemeral:true});
        const participants = new Set();

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(desc)
          .addFields(
            {name:'Prize', value:prize, inline:true},
            {name:'Ends On', value:formatSEShTime(endTime), inline:true},
            {name:'Participants', value:'None'}
          )
          .setColor(0xFFD700);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('giveaway_join').setLabel('🎉 Participate').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('giveaway_leave').setLabel('❌ Leave').setStyle(ButtonStyle.Danger)
        );

        const msg = await ch.send({content:mention?`<@&${mention}>`:null, embeds:[embed], components:[row]});
        giveaways.set(msg.id,{participants, prize, endsOn:endTime});
        setTimeout(async ()=>{
          const data = giveaways.get(msg.id);
          if(!data) return;
          const arr = [...data.participants];
          let winnerText = 'No participants!';
          if(arr.length>0){
            const winner = arr[Math.floor(Math.random()*arr.length)];
            winnerText = `<@${winner}> won the prize! 🎉`;
          }
          const endEmbed = EmbedBuilder.from(embed).spliceFields(0,3,
            {name:'Prize', value:prize},
            {name:'Ends On', value:formatSEShTime(endTime)},
            {name:'Winner', value:winnerText}
          );
          await msg.edit({embeds:[endEmbed], components:[]});
          giveaways.delete(msg.id);
        }, endTime.getTime()-Date.now());

        return interaction.reply({content:`✅ Giveaway started in ${ch}`, ephemeral:true});
      }

      /* ===== ATIS ===== */
      if(cmd==='atis'){
        const icao = interaction.options.getString('icao').toUpperCase();
        const server = interaction.options.getString('server').toLowerCase();

        await interaction.deferReply();
        try{
          const res = await fetch(`https://api.infiniteflight.com/public/v2/atis/${icao}?server=${server}`,{
            headers:{Authorization:`Bearer ${IF_API_KEY}`}
          });
          if(!res.ok) return interaction.editReply({content:`❌ Failed to fetch ATIS for ${icao} on ${server}`});
          const data = await res.json();
          const embed = new EmbedBuilder()
            .setTitle(`🛫 ATIS for ${icao} - ${server.charAt(0).toUpperCase()+server.slice(1)} Server`)
            .setColor(0x1E90FF)
            .addFields(
              {name:'Information', value:data.info||'N/A'},
              {name:'Runways Active', value:data.runways||'N/A'},
              {name:'Weather', value:data.weather||'N/A'}
            )
            .setTimestamp();
          return interaction.editReply({embeds:[embed]});
        }catch(err){console.error(err); return interaction.editReply({content:'❌ Error fetching ATIS'});}
      }

    }

    /* ===== BUTTONS & SELECT MENUS handled here later ===== */

  }catch(err){ console.error(err); }
});

client.login(TOKEN);
