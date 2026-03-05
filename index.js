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
} = require("discord.js");

const fs = require("fs");

/* ===== ENV ===== */

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const OWNER_ID = process.env.OWNER_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;
const IF_API_KEY = process.env.IF_API_KEY;

const GENERAL_ROLE_ID = process.env.GENERAL_ROLE_ID;
const RECRUITER_ROLE_ID = process.env.RECRUITER_ROLE_ID;
const EXEC_ROLE_ID = process.env.EXEC_ROLE_ID;
const PIREP_ROLE_ID = process.env.PIREP_ROLE_ID;

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

let db = JSON.parse(fs.readFileSync("./database.json"));

function saveDB(){
fs.writeFileSync("./database.json", JSON.stringify(db,null,2));
}

/* ===== HELPERS ===== */

function formatDate(date){
return date.toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
}

/* ===== DAILY ROUTE SCHEDULER ===== */

function startScheduler(){

setInterval(async()=>{

if(!db.routes.channel) return;

const now = new Date();
const current = now.toISOString().substring(11,16);

if(current !== db.routes.time) return;

const day = now.toLocaleDateString("en-US",{weekday:"long"}).toLowerCase();

const data = db.routes.week[day];
if(!data) return;

const guild = client.guilds.cache.get(GUILD_ID);
const channel = guild.channels.cache.get(db.routes.channel);

if(!channel) return;

const routeList = data.routes.map(r=>`• ${r}`).join("\n") || "No routes";

const embed = new EmbedBuilder()
.setTitle("✈️ Daily Featured Routes")
.setDescription(`📅 ${formatDate(now)}`)
.addFields(
{name:"📈 Multiplier",value:data.multiplier},
{name:"👨‍✈️ Pilots",value:"All pilots can fly Featured Routes"},
{name:"🛫 Routes",value:routeList}
)
.setColor(0xff6600)
.setTimestamp();

await channel.send({
content: db.routes.role ? `<@&${db.routes.role}>` : null,
embeds:[embed]
});

db.routes.history.push({
day,
date:now.toISOString(),
routes:data.routes
});

saveDB();

},60000);

}

/* ===== COMMANDS ===== */

const commands = [

new SlashCommandBuilder().setName("ping").setDescription("Check bot latency"),

new SlashCommandBuilder()
.setName("say")
.setDescription("Make bot say message")
.addStringOption(o=>o.setName("text").setRequired(true))
.addChannelOption(o=>o.setName("channel")),

new SlashCommandBuilder()
.setName("kick")
.setDescription("Kick user")
.addUserOption(o=>o.setName("user").setRequired(true)),

new SlashCommandBuilder()
.setName("ban")
.setDescription("Ban user")
.addUserOption(o=>o.setName("user").setRequired(true)),

new SlashCommandBuilder()
.setName("status")
.setDescription("Set bot status")
.addStringOption(o=>o.setName("type").setRequired(true)
.addChoices(
{name:"Playing",value:"PLAYING"},
{name:"Watching",value:"WATCHING"},
{name:"Listening",value:"LISTENING"}
))
.addStringOption(o=>o.setName("text").setRequired(true)),

/* ROUTE COMMANDS */

new SlashCommandBuilder()
.setName("set-weekly-schedule")
.setDescription("Set route channel and role")
.addChannelOption(o=>
  o.setName("channel")
   .setDescription("Channel where routes will be posted")
   .setRequired(true)
)
.addRoleOption(o=>
  o.setName("role")
   .setDescription("Role to ping for routes")
   .setRequired(true)
),

new SlashCommandBuilder()
.setName("set-time")
.setDescription("Set route posting time")
.addStringOption(o=>
  o.setName("time")
   .setDescription("Time in HH:MM format")
   .setRequired(true)
),

new SlashCommandBuilder()
.setName("add-route")
.setDescription("Add route to a day")
.addStringOption(o=>
  o.setName("day")
   .setDescription("Day of the week")
   .setRequired(true)
)
.addStringOption(o=>
  o.setName("route")
   .setDescription("Route to add")
   .setRequired(true)
),

new SlashCommandBuilder()
.setName("remove-route")
.setDescription("Remove route from a day")
.addStringOption(o=>
  o.setName("day")
   .setDescription("Day of the week")
   .setRequired(true)
)
.addStringOption(o=>
  o.setName("route")
   .setDescription("Route to remove")
   .setRequired(true)
),

new SlashCommandBuilder()
.setName("set-multiplier")
.setDescription("Set multiplier for a day")
.addStringOption(o=>
  o.setName("day")
   .setDescription("Day of the week")
   .setRequired(true)
)
.addStringOption(o=>
  o.setName("value")
   .setDescription("Multiplier value like 1.5x")
   .setRequired(true)
),

new SlashCommandBuilder()
.setName("view-routes")
.setDescription("View today's featured routes"),

new SlashCommandBuilder()
.setName("view-weekly-routes")
.setDescription("View routes for the entire week"),

new SlashCommandBuilder()
.setName("force-send")
.setDescription("Force send today's routes"),

new SlashCommandBuilder()
.setName("route-history")
.setDescription("View previously posted routes")
/* ===== REGISTER COMMANDS ===== */

(async()=>{
const rest = new REST({version:"10"}).setToken(TOKEN);
await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:commands});
console.log("Slash commands registered");
})();

/* ===== READY ===== */

client.once("ready",()=>{
console.log(`Logged in as ${client.user.tag}`);
startScheduler();
});

/* ===== INTERACTIONS ===== */

client.on("interactionCreate",async interaction=>{

if(!interaction.isChatInputCommand()) return;

const cmd = interaction.commandName;

/* PING */

if(cmd==="ping")
return interaction.reply(`Pong ${client.ws.ping}ms`);

/* SAY */

if(cmd==="say"){
const text = interaction.options.getString("text");
const channel = interaction.options.getChannel("channel") || interaction.channel;
await channel.send(text);
return interaction.reply({content:"Sent",ephemeral:true});
}

/* KICK */

if(cmd==="kick"){
if(!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers))
return interaction.reply("No permission");

const user = interaction.options.getUser("user");
const member = interaction.guild.members.cache.get(user.id);

await member.kick();
return interaction.reply(`Kicked ${user.tag}`);
}

/* BAN */

if(cmd==="ban"){
if(!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers))
return interaction.reply("No permission");

const user = interaction.options.getUser("user");
const member = interaction.guild.members.cache.get(user.id);

await member.ban();
return interaction.reply(`Banned ${user.tag}`);
}

/* STATUS */

if(cmd==="status"){

if(interaction.user.id !== OWNER_ID)
return interaction.reply("Owner only");

const type = interaction.options.getString("type");
const text = interaction.options.getString("text");

let act = ActivityType.Playing;

if(type==="WATCHING") act = ActivityType.Watching;
if(type==="LISTENING") act = ActivityType.Listening;

client.user.setActivity(text,{type:act});

return interaction.reply("Status updated");
}

/* SET WEEKLY SCHEDULE */

if(cmd==="set-weekly-schedule"){

if(!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
return interaction.reply("Admin only");

const channel = interaction.options.getChannel("channel");
const role = interaction.options.getRole("role");

db.routes.channel = channel.id;
db.routes.role = role.id;

saveDB();

return interaction.reply("Schedule set");
}

/* SET TIME */

if(cmd==="set-time"){

db.routes.time = interaction.options.getString("time");

saveDB();

return interaction.reply("Time updated");
}

/* ADD ROUTE */

if(cmd==="add-route"){

const day = interaction.options.getString("day").toLowerCase();
const route = interaction.options.getString("route");

db.routes.week[day].routes.push(route);

saveDB();

return interaction.reply("Route added");
}

/* REMOVE ROUTE */

if(cmd==="remove-route"){

const day = interaction.options.getString("day").toLowerCase();
const route = interaction.options.getString("route");

db.routes.week[day].routes =
db.routes.week[day].routes.filter(r=>r!==route);

saveDB();

return interaction.reply("Route removed");
}

/* MULTIPLIER */

if(cmd==="set-multiplier"){

const day = interaction.options.getString("day").toLowerCase();
const value = interaction.options.getString("value");

db.routes.week[day].multiplier = value;

saveDB();

return interaction.reply("Multiplier set");
}

/* VIEW TODAY */

if(cmd==="view-routes"){

const day = new Date().toLocaleDateString("en-US",{weekday:"long"}).toLowerCase();
const data = db.routes.week[day];

const embed = new EmbedBuilder()
.setTitle("Today's Routes")
.addFields(
{name:"Multiplier",value:data.multiplier},
{name:"Routes",value:data.routes.join("\n")||"None"}
)
.setColor(0xff6600);

return interaction.reply({embeds:[embed]});
}

/* VIEW WEEK */

if(cmd==="view-weekly-routes"){

const embed = new EmbedBuilder()
.setTitle("Weekly Routes")
.setColor(0xff6600);

for(const d in db.routes.week){

embed.addFields({
name:d.toUpperCase(),
value:db.routes.week[d].routes.join("\n")||"None"
});

}

return interaction.reply({embeds:[embed]});
}

/* FORCE SEND */

if(cmd==="force-send"){

const day = new Date().toLocaleDateString("en-US",{weekday:"long"}).toLowerCase();
const data = db.routes.week[day];

const channel = client.channels.cache.get(db.routes.channel);

const embed = new EmbedBuilder()
.setTitle("✈️ Daily Featured Routes")
.addFields(
{name:"Multiplier",value:data.multiplier},
{name:"Routes",value:data.routes.join("\n")}
)
.setColor(0xff6600);

await channel.send({
content:`<@&${db.routes.role}>`,
embeds:[embed]
});

return interaction.reply("Routes sent");
}

/* HISTORY */

if(cmd==="route-history"){

const embed = new EmbedBuilder()
.setTitle("Route History")
.setColor(0xff6600);

db.routes.history.slice(-5).forEach(h=>{
embed.addFields({
name:h.day,
value:h.routes.join("\n")
});
});

return interaction.reply({embeds:[embed]});
}

});

client.login(TOKEN);
