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

const fs = require("fs");

/* ===== ENV ===== */

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const OWNER_ID = process.env.OWNER_ID;

const IF_API_KEY = process.env.IF_API_KEY;

const GENERAL_ROLE_ID = process.env.GENERAL_ROLE_ID;
const RECRUITER_ROLE_ID = process.env.RECRUITER_ROLE_ID;
const EXEC_ROLE_ID = process.env.EXEC_ROLE_ID;
const PIREP_ROLE_ID = process.env.PIREP_ROLE_ID;

const PILOT_ROLE_ID = "1432617094956060683";

/* ===== CLIENT ===== */

const client = new Client({
intents:[
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMembers,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent
]
});

/* ===== DATABASE ===== */

const dbFile = "./database.json";

let db = {
routes:{
schedule:{},
time:"00:00",
channel:null,
history:[]
}
};

if(fs.existsSync(dbFile)){
db = JSON.parse(fs.readFileSync(dbFile));
}

function saveDB(){
fs.writeFileSync(dbFile,JSON.stringify(db,null,2));
}

/* ===== HELPERS ===== */

function todayDay(){
return new Date().toLocaleDateString("en-US",{weekday:"long",timeZone:"Asia/Kolkata"});
}

function todayDate(){
return new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric",timeZone:"Asia/Kolkata"});
}

/* ===== SLASH COMMANDS ===== */

const commands = [

new SlashCommandBuilder()
.setName("ping")
.setDescription("Check bot latency"),

new SlashCommandBuilder()
.setName("say")
.setDescription("Make the bot say something")
.addStringOption(o=>o.setName("text").setDescription("Message").setRequired(true)),

new SlashCommandBuilder()
.setName("kick")
.setDescription("Kick member")
.addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)),

new SlashCommandBuilder()
.setName("ban")
.setDescription("Ban member")
.addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)),

new SlashCommandBuilder()
.setName("status")
.setDescription("Set bot status")
.addStringOption(o=>o.setName("type").setDescription("Type").setRequired(true)
.addChoices(
{name:"Playing",value:"PLAYING"},
{name:"Watching",value:"WATCHING"},
{name:"Listening",value:"LISTENING"}
))
.addStringOption(o=>o.setName("text").setDescription("Text").setRequired(true)),

/* ROUTES SYSTEM */

new SlashCommandBuilder()
.setName("set-weekly-schedule")
.setDescription("Set route channel")
.addChannelOption(o=>o.setName("channel").setDescription("Channel").setRequired(true)),

new SlashCommandBuilder()
.setName("set-time")
.setDescription("Set route post time")
.addStringOption(o=>o.setName("time").setDescription("HH:MM").setRequired(true)),

new SlashCommandBuilder()
.setName("add-route")
.setDescription("Add route")
.addStringOption(o=>o.setName("day").setDescription("Day").setRequired(true))
.addStringOption(o=>o.setName("route").setDescription("Route").setRequired(true)),

new SlashCommandBuilder()
.setName("remove-route")
.setDescription("Remove route")
.addStringOption(o=>o.setName("day").setDescription("Day").setRequired(true))
.addStringOption(o=>o.setName("route").setDescription("Route").setRequired(true)),

new SlashCommandBuilder()
.setName("view-routes")
.setDescription("View today's routes"),

new SlashCommandBuilder()
.setName("view-weekly-routes")
.setDescription("View weekly routes"),

new SlashCommandBuilder()
.setName("force-send")
.setDescription("Force send today's routes")

].map(c=>c.toJSON());

/* ===== REGISTER COMMANDS ===== */

async function registerCommands(){
const rest = new REST({version:"10"}).setToken(TOKEN);

await rest.put(
Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),
{body:commands}
);

console.log("Slash commands registered");
}

registerCommands();

/* ===== ROUTE SENDER ===== */

async function sendRoutes(){

if(!db.routes.channel) return;

const channel = await client.channels.fetch(db.routes.channel).catch(()=>null);
if(!channel) return;

const day = todayDay();
const routes = db.routes.schedule[day];

if(!routes || routes.length===0) return;

const embed = new EmbedBuilder()
.setTitle("✈️ Daily Featured Routes")
.setDescription(`📅 ${day}, ${todayDate()}

👨‍✈️ All pilots can fly Featured Routes.

🛫 Routes
${routes.map(r=>"• "+r).join("\n")}

📈 Multiplier: 1.7x`)
.setColor(0xff6600);

await channel.send({
content:`<@&${PILOT_ROLE_ID}>`,
embeds:[embed]
});

db.routes.history.push({day,date:todayDate(),routes});
saveDB();

}

/* ===== READY ===== */

client.once("ready",()=>{

console.log(`Logged in as ${client.user.tag}`);

setInterval(()=>{

const now = new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Kolkata"});

if(now===db.routes.time){
sendRoutes();
}

},60000);

});

/* ===== COMMAND HANDLER ===== */

client.on("interactionCreate",async interaction=>{

if(!interaction.isChatInputCommand()) return;

const cmd = interaction.commandName;

/* OLD COMMANDS */

if(cmd==="ping"){
return interaction.reply(`🏓 Pong ${client.ws.ping}ms`);
}

if(cmd==="say"){
const text = interaction.options.getString("text");
await interaction.channel.send(text);
return interaction.reply({content:"Sent",ephemeral:true});
}

if(cmd==="kick"){
if(!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers))
return interaction.reply({content:"No permission",ephemeral:true});

const user = interaction.options.getUser("user");
const member = interaction.guild.members.cache.get(user.id);
await member.kick();

return interaction.reply(`Kicked ${user.tag}`);
}

if(cmd==="ban"){
if(!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers))
return interaction.reply({content:"No permission",ephemeral:true});

const user = interaction.options.getUser("user");
const member = interaction.guild.members.cache.get(user.id);
await member.ban();

return interaction.reply(`Banned ${user.tag}`);
}

if(cmd==="status"){

if(interaction.user.id!==OWNER_ID)
return interaction.reply({content:"Owner only",ephemeral:true});

const type = interaction.options.getString("type");
const text = interaction.options.getString("text");

let act = ActivityType.Playing;

if(type==="WATCHING") act = ActivityType.Watching;
if(type==="LISTENING") act = ActivityType.Listening;

client.user.setActivity(text,{type:act});

return interaction.reply({content:"Status updated",ephemeral:true});

}

/* ROUTE COMMANDS */

if(cmd==="set-weekly-schedule"){

const channel = interaction.options.getChannel("channel");

db.routes.channel = channel.id;
saveDB();

return interaction.reply("Route channel set");

}

if(cmd==="set-time"){

const time = interaction.options.getString("time");

db.routes.time = time;
saveDB();

return interaction.reply(`Route time set to ${time} IST`);

}

if(cmd==="add-route"){

const day = interaction.options.getString("day");
const route = interaction.options.getString("route");

if(!db.routes.schedule[day]) db.routes.schedule[day]=[];

db.routes.schedule[day].push(route);
saveDB();

return interaction.reply("Route added");

}

if(cmd==="remove-route"){

const day = interaction.options.getString("day");
const route = interaction.options.getString("route");

if(!db.routes.schedule[day]) return interaction.reply("No routes");

db.routes.schedule[day] = db.routes.schedule[day].filter(r=>r!==route);

saveDB();

return interaction.reply("Route removed");

}

if(cmd==="view-routes"){

const day = todayDay();
const routes = db.routes.schedule[day];

if(!routes) return interaction.reply("No routes today");

return interaction.reply(`Routes for ${day}

${routes.join("\n")}`);

}

if(cmd==="view-weekly-routes"){

let text = "";

for(const d in db.routes.schedule){

text += `\n${d}\n${db.routes.schedule[d].join("\n")}\n`;

}

return interaction.reply(text || "No routes");

}

if(cmd==="force-send"){

await sendRoutes();

return interaction.reply("Routes sent");

}

});

client.login(TOKEN);
