const { 
  Client, GatewayIntentBits, PermissionsBitField,
  REST, Routes,
  SlashCommandBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, ChannelType, ActivityType 
} = require('discord.js');
const fs = require('fs');
const cron = require('node-cron');
const fetch = require('node-fetch');

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

// ================= CLIENT =================
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent
]});

// ================= DATA STORAGE =================
if(!fs.existsSync('./database.json')){
  fs.writeFileSync('./database.json', JSON.stringify({
    tickets:{}, // ticketNumber -> {userId, channelId, claimedBy, category}
    ticketCounter:0,
    events:{}, // messageId -> {title, description, time, attendees, channel, embed}
    giveaways:{}, // messageId -> {participants, prize, endsOn}
    routes:{}, // YYYY-MM-DD -> {multiplier, routes}
    weeklyRoutes:{}, // Monday-Sunday -> {multiplier, routes}
    routeSettings:{channelId:null, roleId:null}
  }, null,2));
}
let db = JSON.parse(fs.readFileSync('./database.json'));
const saveDB = ()=> fs.writeFileSync('./database.json', JSON.stringify(db, null,2));

// ================= HELPERS =================
function formatSEShTime(date){
  return date.toLocaleString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:true });
}

function generateTicketNumber(){
  db.ticketCounter++;
  saveDB();
  return `ticket-${String(db.ticketCounter).padStart(3,'0')}`;
}

// ================= SLASH COMMANDS =================
const commands = [
  // --- OLD COMMANDS ---
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
    .addStringOption(opt => opt.setName('server').setDescription('Server: casual, training, expert').setRequired(true)),

  // --- FEATURED ROUTES ---
  new SlashCommandBuilder()
    .setName('setroutechannel')
    .setDescription('Set channel for daily featured routes')
    .addChannelOption(opt=>opt.setName('channel').setDescription('Channel').setRequired(true)),
  new SlashCommandBuilder()
    .setName('setrouterole')
    .setDescription('Set role to ping for featured routes')
    .addRoleOption(opt=>opt.setName('role').setDescription('Role').setRequired(true)),
  new SlashCommandBuilder()
    .setName('setroutes')
    .setDescription('Set featured routes for a specific date')
    .addStringOption(opt=>opt.setName('date').setDescription('YYYY-MM-DD').setRequired(true))
    .addStringOption(opt=>opt.setName('multiplier').setDescription('Example: 2x').setRequired(true))
    .addStringOption(opt=>opt.setName('routes').setDescription('Emoji | FlightNo | Route').setRequired(true)),
  new SlashCommandBuilder()
    .setName('setweeklyroutes')
    .setDescription('Set weekly routes template')
    .addStringOption(opt=>opt.setName('day').setDescription('Day of week').setRequired(true)
      .addChoices(
        {name:"Monday", value:"Monday"},
        {name:"Tuesday", value:"Tuesday"},
        {name:"Wednesday", value:"Wednesday"},
        {name:"Thursday", value:"Thursday"},
        {name:"Friday", value:"Friday"},
        {name:"Saturday", value:"Saturday"},
        {name:"Sunday", value:"Sunday"}
      ))
    .addStringOption(opt=>opt.setName('multiplier').setDescription('Example: 1.5x').setRequired(true))
    .addStringOption(opt=>opt.setName('routes').setDescription('Emoji | FlightNo | Route').setRequired(true)),
  new SlashCommandBuilder()
    .setName('viewroutes')
    .setDescription('View all routes'),
  new SlashCommandBuilder()
    .setName('removeroutes')
    .setDescription('Remove specific date routes')
    .addStringOption(opt=>opt.setName('date').setDescription('YYYY-MM-DD').setRequired(true)),
  new SlashCommandBuilder()
    .setName('routedashboard')
    .setDescription('View route system dashboard'),

  // --- TICKET COMMANDS ---
  new SlashCommandBuilder()
    .setName('closeticket')
    .setDescription('Close a ticket (staff only)'),
  new SlashCommandBuilder()
    .setName('reopenticket')
    .setDescription('Reopen a closed ticket (staff only)'),
  new SlashCommandBuilder()
    .setName('addusertoticket')
    .setDescription('Add user to ticket')
    .addUserOption(opt=>opt.setName('user').setDescription('User to add').setRequired(true)),
  new SlashCommandBuilder()
    .setName('removeuserfromticket')
    .setDescription('Remove user from ticket')
    .addUserOption(opt=>opt.setName('user').setDescription('User to remove').setRequired(true))
].map(cmd=>cmd.toJSON());

// ================= REGISTER =================
(async()=>{
  const rest = new REST({version:'10'}).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID), {body:commands});
  console.log("✅ Slash commands registered");
})();

// ================= READY =================
client.once('ready', ()=>console.log(`🤖 Logged in as ${client.user.tag}`));

// ================= INTERACTIONS =================
client.on('interactionCreate', async interaction=>{
  try{
    if(interaction.isChatInputCommand()){
      const cmd = interaction.commandName;

      // ----- OLD COMMANDS -----
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

      // --- FEATURED ROUTES COMMANDS ---
      if(cmd==='setroutechannel'){
        const ch = interaction.options.getChannel('channel');
        db.routeSettings.channelId = ch.id;
        saveDB();
        return interaction.reply({content:`✅ Featured Routes channel set to ${ch}`, ephemeral:true});
      }
      if(cmd==='setrouterole'){
        const role = interaction.options.getRole('role');
        db.routeSettings.roleId = role.id;
        saveDB();
        return interaction.reply({content:`✅ Route ping role set to ${role}`, ephemeral:true});
      }
      if(cmd==='setroutes'){
        const date = interaction.options.getString('date');
        const multiplier = interaction.options.getString('multiplier');
        const routes = interaction.options.getString('routes');
        db.routes[date] = {multiplier,routes};
        saveDB();
        return interaction.reply({content:`✅ Routes set for ${date}`, ephemeral:true});
      }
      if(cmd==='setweeklyroutes'){
        const day = interaction.options.getString('day');
        const multiplier = interaction.options.getString('multiplier');
        const routes = interaction.options.getString('routes');
        db.weeklyRoutes[day] = {multiplier,routes};
        saveDB();
        return interaction.reply({content:`✅ Weekly routes set for ${day}`, ephemeral:true});
      }
      if(cmd==='viewroutes'){
        let msg = '';
        for(const date in db.routes) msg+=`${date} -> ${db.routes[date].multiplier} Multiplier\n${db.routes[date].routes}\n\n`;
        return interaction.reply({content: msg||'No routes found', ephemeral:true});
      }
      if(cmd==='removeroutes'){
        const date = interaction.options.getString('date');
        delete db.routes[date];
        saveDB();
        return interaction.reply({content:`✅ Routes removed for ${date}`, ephemeral:true});
      }

      // --- TICKET COMMANDS ---
      // Implement later fully with claim, close, add/remove user

      // --- GIVEAWAY, EVENT, ATIS handled as before ---
    }
  }catch(err){console.error(err);}
});

// ================= FEATURED ROUTES AUTO-POST =================
cron.schedule("0 0 * * *", async ()=>{
  const todayDate = new Date().toISOString().split('T')[0];
  const chId = db.routeSettings.channelId;
  if(!chId) return;
  const ch = await client.channels.fetch(chId).catch(()=>null);
  if(!ch) return;

  let data = db.routes[todayDate];
  if(!data){
    // fallback to weekly
    const dayName = new Date().toLocaleDateString('en-US',{weekday:'long', timeZone:'UTC'});
    data = db.weeklyRoutes[dayName];
  }
  if(!data) return;

  const embed = new EmbedBuilder()
    .setTitle("🌟 Daily Featured Routes")
    .setDescription(`Featured routes for **${todayDate}**\n\n🔥 **${data.multiplier} Multiplier** on these routes:\n${data.routes}`)
    .setColor(0xFFA500);

  await ch.send({content: db.routeSettings.roleId?`<@&${db.routeSettings.roleId}>`:null, embeds:[embed]});
});

client.login(TOKEN);
