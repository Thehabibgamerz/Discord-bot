const { 
  Client, GatewayIntentBits, PermissionsBitField,
  REST, Routes,
  SlashCommandBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, ChannelType, ActivityType 
} = require('discord.js');
const fetch = require('node-fetch'); // For ATIS
const cron = require('node-cron');
const fs = require('fs');

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

/* ===== DATABASE ===== */
if (!fs.existsSync('./database.json')) {
  fs.writeFileSync('./database.json', JSON.stringify({
    tickets: {},
    ticketCounter: 0,
    events: {},
    giveaways: {},
    routes: {},
    weeklyRoutes: {},
    routeSettings: { channelId:null, roleId:null }
  }, null, 2));
}

let db = JSON.parse(fs.readFileSync('./database.json'));
const saveDB = () => fs.writeFileSync('./database.json', JSON.stringify(db,null,2));

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
    .addStringOption(opt=>opt.setName('text').setDescription('Message').setRequired(true))
    .addChannelOption(opt=>opt.setName('channel').setDescription('Optional channel')),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member')
    .addUserOption(opt=>opt.setName('user').setDescription('User to kick').setRequired(true)),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member')
    .addUserOption(opt=>opt.setName('user').setDescription('User to ban').setRequired(true)),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Set bot status (owner only)')
    .addStringOption(opt=>opt.setName('type').setDescription('Status type').setRequired(true)
      .addChoices(
        {name:"Playing", value:"PLAYING"},
        {name:"Watching", value:"WATCHING"},
        {name:"Listening", value:"LISTENING"},
        {name:"Streaming", value:"STREAMING"}
      ))
    .addStringOption(opt=>opt.setName('text').setDescription('Status text').setRequired(true)),
  new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Send the ticket panel')
    .addChannelOption(opt=>opt.setName('channel').setDescription('Channel to send panel').setRequired(true))
    .addStringOption(opt=>opt.setName('image').setDescription('Optional panel image URL')),
  new SlashCommandBuilder()
    .setName('atis')
    .setDescription('Get live ATIS from Infinite Flight')
    .addStringOption(opt=>opt.setName('icao').setDescription('Airport ICAO code').setRequired(true))
    .addStringOption(opt=>opt.setName('server').setDescription('Server: casual, training, expert').setRequired(true)),
  new SlashCommandBuilder()
    .setName('setroutechannel')
    .setDescription('Set channel for daily featured routes')
    .addChannelOption(o=>o.setName('channel').setDescription('Select channel').setRequired(true)),
  new SlashCommandBuilder()
    .setName('setrouterole')
    .setDescription('Set role to mention in route posts')
    .addRoleOption(o=>o.setName('role').setDescription('Select role').setRequired(true)),
  new SlashCommandBuilder()
    .setName('setroutes')
    .setDescription('Set featured routes for specific date')
    .addStringOption(o=>o.setName('date').setDescription('YYYY-MM-DD').setRequired(true))
    .addStringOption(o=>o.setName('multiplier').setDescription('Multiplier (e.g., 2x)').setRequired(true))
    .addStringOption(o=>o.setName('routes').setDescription('Emoji | Flight | Route (newline separated)').setRequired(true))
].map(cmd=>cmd.toJSON());

/* ===== REGISTER COMMANDS ===== */
(async ()=>{
  const rest = new REST({version:'10'}).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID), {body:commands});
  console.log("✅ Slash commands registered");
})();

/* ===== READY ===== */
client.once('ready', ()=>console.log(`🤖 Logged in as ${client.user.tag}`));

/* ===== INTERACTIONS ===== */
client.on('interactionCreate', async interaction=>{
  try{
    if(interaction.isChatInputCommand()){
      const cmd = interaction.commandName;

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

      if(cmd==='setroutechannel'){
        const ch = interaction.options.getChannel('channel');
        db.routeSettings.channelId = ch.id;
        saveDB();
        return interaction.reply({content:`✅ Route posting channel set to ${ch}`, ephemeral:true});
      }

      if(cmd==='setrouterole'){
        const role = interaction.options.getRole('role');
        db.routeSettings.roleId = role.id;
        saveDB();
        return interaction.reply({content:`✅ Route mention role set to ${role}`, ephemeral:true});
      }

      if(cmd==='setroutes'){
        const date = interaction.options.getString('date');
        const multiplier = interaction.options.getString('multiplier');
        const routes = interaction.options.getString('routes');
        db.routes[date] = {multiplier,routes};
        saveDB();
        return interaction.reply({content:`✅ Routes set for ${date}`, ephemeral:true});
      }
    }
  }catch(err){console.error(err);}
});

/* ===== DAILY FEATURED ROUTES ===== */
cron.schedule('0 0 * * *', async ()=>{
  const todayDate = new Date().toISOString().split('T')[0];
  const todayDay = new Date().toLocaleDateString('en-US',{weekday:'long', timeZone:'UTC'});

  if(!db.routeSettings.channelId) return;
  const ch = await client.channels.fetch(db.routeSettings.channelId).catch(()=>null);
  if(!ch) return;

  let data = db.routes[todayDate] || db.weeklyRoutes[todayDay];
  if(!data) return;

  const embed = new EmbedBuilder()
    .setTitle('🌟 Daily Featured Routes')
    .setDescription(`Featured routes for **${todayDate}**\n\n🔥 **${data.multiplier} Multiplier Available** on these routes!\n\n${data.routes}`)
    .setColor(0xFFA500);

  let content = db.routeSettings.roleId?`<@&${db.routeSettings.roleId}>`:null;
  await ch.send({content, embeds:[embed]});
});

client.login(TOKEN);
