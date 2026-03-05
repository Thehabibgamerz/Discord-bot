const {
Client,
GatewayIntentBits,
PermissionsBitField,
REST,
Routes,
SlashCommandBuilder,
ActionRowBuilder,
StringSelectMenuBuilder,
ButtonBuilder,
ButtonStyle,
EmbedBuilder,
ActivityType
} = require('discord.js');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

/* ===== ENV ===== */
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const OWNER_ID = process.env.OWNER_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;
const IF_API_KEY = process.env.IF_API_KEY;

// Roles
const GENERAL_ROLE_ID = process.env.GENERAL_ROLE_ID;
const RECRUITER_ROLE_ID = process.env.RECRUITER_ROLE_ID;
const EXEC_ROLE_ID = process.env.EXEC_ROLE_ID;
const PIREP_ROLE_ID = process.env.PIREP_ROLE_ID;

const client = new Client({
intents:[
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMembers,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent
]
});

/* ===== DATA ===== */
const events = new Map();
const giveaways = new Map();

/* ===== HELPERS ===== */
function formatSEShTime(date){
return date.toLocaleString('en-US',{
weekday:'long',
year:'numeric',
month:'long',
day:'numeric',
hour:'2-digit',
minute:'2-digit',
hour12:true
});
}

/* ===== COMMANDS ===== */

const commands = [

new SlashCommandBuilder()
.setName('ping')
.setDescription('Check bot latency'),

new SlashCommandBuilder()
.setName('say')
.setDescription('Make the bot say something')
.addStringOption(opt=>opt.setName('text').setDescription('Message').setRequired(true))
.addChannelOption(opt=>opt.setName('channel').setDescription('Optional channel')),

new SlashCommandBuilder()
.setName('kick')
.setDescription('Kick a member')
.addUserOption(opt=>opt.setName('user').setDescription('User').setRequired(true)),

new SlashCommandBuilder()
.setName('ban')
.setDescription('Ban a member')
.addUserOption(opt=>opt.setName('user').setDescription('User').setRequired(true)),

new SlashCommandBuilder()
.setName('status')
.setDescription('Set bot status')
.addStringOption(opt=>opt.setName('type')
.setDescription('Type')
.setRequired(true)
.addChoices(
{name:'Playing',value:'PLAYING'},
{name:'Watching',value:'WATCHING'},
{name:'Listening',value:'LISTENING'},
{name:'Streaming',value:'STREAMING'}
))
.addStringOption(opt=>opt.setName('text').setDescription('Status text').setRequired(true)),

new SlashCommandBuilder()
.setName('ticketpanel')
.setDescription('Send ticket panel')
.addChannelOption(opt=>opt.setName('channel').setDescription('Channel').setRequired(true))
.addStringOption(opt=>opt.setName('image').setDescription('Image URL')),

new SlashCommandBuilder()
.setName('event')
.setDescription('Create event')
.addStringOption(opt=>opt.setName('title').setDescription('Title').setRequired(true))
.addStringOption(opt=>opt.setName('description').setDescription('Description').setRequired(true))
.addStringOption(opt=>opt.setName('time').setDescription('YYYY-MM-DD HH:mm').setRequired(true))
.addChannelOption(opt=>opt.setName('channel').setDescription('Channel').setRequired(true))
.addStringOption(opt=>opt.setName('image').setDescription('Image'))
.addStringOption(opt=>opt.setName('mention').setDescription('Role ID')),

new SlashCommandBuilder()
.setName('giveaway')
.setDescription('Create giveaway')
.addStringOption(opt=>opt.setName('title').setDescription('Title').setRequired(true))
.addStringOption(opt=>opt.setName('description').setDescription('Description').setRequired(true))
.addStringOption(opt=>opt.setName('prize').setDescription('Prize').setRequired(true))
.addStringOption(opt=>opt.setName('ends_on').setDescription('YYYY-MM-DD HH:mm').setRequired(true))
.addChannelOption(opt=>opt.setName('channel').setDescription('Channel').setRequired(true))
.addStringOption(opt=>opt.setName('mention').setDescription('Role ID')),

new SlashCommandBuilder()
.setName('atis')
.setDescription('Get Infinite Flight ATIS')
.addStringOption(opt=>opt.setName('icao').setDescription('ICAO').setRequired(true))
.addStringOption(opt=>opt.setName('server').setDescription('casual / training / expert').setRequired(true))

].map(c=>c.toJSON());

/* ===== REGISTER COMMANDS ===== */

(async()=>{
const rest = new REST({version:'10'}).setToken(TOKEN);
await rest.put(
Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),
{body:commands}
);
console.log("✅ Slash commands registered");
})();

/* ===== READY ===== */

client.once('ready',()=>{
console.log(`🤖 Logged in as ${client.user.tag}`);
});

/* ===== INTERACTIONS ===== */

client.on('interactionCreate', async interaction=>{

if(!interaction.isChatInputCommand()) return;

const cmd = interaction.commandName;

/* ===== PING ===== */

if(cmd==="ping"){
return interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);
}

/* ===== SAY ===== */

if(cmd==="say"){

const text = interaction.options.getString("text");
const channel = interaction.options.getChannel("channel") || interaction.channel;

await channel.send(text);

return interaction.reply({
content:`✅ Message sent to ${channel}`,
ephemeral:true
});
}

/* ===== KICK ===== */

if(cmd==="kick"){

if(!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers))
return interaction.reply({content:"❌ No permission",ephemeral:true});

const user = interaction.options.getUser("user");
const member = interaction.guild.members.cache.get(user.id);

if(member){
await member.kick();
return interaction.reply(`👢 Kicked ${user.tag}`);
}

}

/* ===== BAN ===== */

if(cmd==="ban"){

if(!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers))
return interaction.reply({content:"❌ No permission",ephemeral:true});

const user = interaction.options.getUser("user");
const member = interaction.guild.members.cache.get(user.id);

if(member){
await member.ban();
return interaction.reply(`🔨 Banned ${user.tag}`);
}

}

/* ===== STATUS ===== */

if(cmd==="status"){

if(interaction.user.id!==OWNER_ID)
return interaction.reply({content:"❌ Owner only",ephemeral:true});

const type = interaction.options.getString("type");
const text = interaction.options.getString("text");

let act = ActivityType.Playing;

if(type==="WATCHING") act=ActivityType.Watching;
if(type==="LISTENING") act=ActivityType.Listening;
if(type==="STREAMING") act=ActivityType.Streaming;

client.user.setActivity(text,{type:act});

return interaction.reply({
content:`✅ Status updated`,
ephemeral:true
});

}

/* ===== TICKET PANEL ===== */

if(cmd==="ticketpanel"){

if(!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
return interaction.reply({content:"❌ Admin only",ephemeral:true});

const channel = interaction.options.getChannel("channel");
const image = interaction.options.getString("image");

const embed = new EmbedBuilder()
.setTitle("🎫 Support Centre")
.setDescription("Select a category to open ticket")
.setColor(0xff6600);

if(image) embed.setImage(image);

const row = new ActionRowBuilder().addComponents(

new StringSelectMenuBuilder()
.setCustomId("ticket_select")
.setPlaceholder("Select category")
.addOptions([
{label:"General Support",value:"general"},
{label:"Recruitments",value:"recruit"},
{label:"Executive Support",value:"exec"},
{label:"PIREP Support",value:"pirep"}
])

);

await channel.send({embeds:[embed],components:[row]});

return interaction.reply({content:"✅ Ticket panel sent",ephemeral:true});

}

/* ===== ATIS ===== */

if(cmd==="atis"){

const icao = interaction.options.getString("icao").toUpperCase();
const server = interaction.options.getString("server").toLowerCase();

await interaction.deferReply();

try{

const res = await fetch(
`https://api.infiniteflight.com/public/v2/atis/${icao}?server=${server}`,
{
headers:{Authorization:`Bearer ${IF_API_KEY}`}
}
);

if(!res.ok)
return interaction.editReply("❌ Failed to fetch ATIS");

const data = await res.json();

const embed = new EmbedBuilder()
.setTitle(`🛫 ATIS ${icao}`)
.setColor(0x1E90FF)
.addFields(
{name:"Information",value:data.info||"N/A"},
{name:"Runways",value:data.runways||"N/A"},
{name:"Weather",value:data.weather||"N/A"}
)
.setTimestamp();

interaction.editReply({embeds:[embed]});

}catch(err){
console.error(err);
interaction.editReply("❌ Error fetching ATIS");
}

}

});

client.login(TOKEN);
