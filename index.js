const { 
Client,
GatewayIntentBits,
EmbedBuilder,
PermissionsBitField,
ChannelType
} = require("discord.js")

const fs = require("fs")
const cron = require("node-cron")

const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.GuildMembers
]
})

const TOKEN = process.env.TOKEN

function loadDB(){
return JSON.parse(fs.readFileSync("./database.json"))
}

function saveDB(data){
fs.writeFileSync("./database.json", JSON.stringify(data,null,2))
}

function getDay(){
return new Date().toLocaleDateString("en-US",{weekday:"long", timeZone:"Asia/Kolkata"}).toLowerCase()
}

async function sendRoutes(guild){

let db = loadDB()

if(!db.config.channelId) return

const channel = guild.channels.cache.get(db.config.channelId)
if(!channel) return

const day = getDay()

const data = db.routes[day]

const date = new Date().toLocaleDateString("en-US",{
weekday:"long",
year:"numeric",
month:"long",
day:"numeric",
timeZone:"Asia/Kolkata"
})

const routes = data.routes.length
? data.routes.map(r=>`• ${r}`).join("\n")
: "No routes set"

const embed = new EmbedBuilder()
.setTitle("✈️ Daily Featured Routes")
.setDescription(`📅 ${date}

📈 Multiplier: **${data.multiplier}**

👨‍✈️ All pilots can fly Featured Routes.

🛫 Routes
${routes}`)
.setColor("Blue")

await channel.send({
content:`<@&${db.config.roleId}>`,
embeds:[embed]
})

db.history.push({
day,
date,
routes:data.routes
})

saveDB(db)

}

client.once("ready", async ()=>{

console.log(`Logged in as ${client.user.tag}`)

cron.schedule("0 0 * * *", ()=>{

client.guilds.cache.forEach(g=>{
sendRoutes(g)
})

},{
timezone:"Asia/Kolkata"
})

})

client.on("interactionCreate", async interaction=>{

if(!interaction.isChatInputCommand()) return

const db = loadDB()

if(interaction.commandName === "set-weekly-schedule"){

if(!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
return interaction.reply({content:"Admin only",ephemeral:true})

const channel = interaction.options.getChannel("channel")
const role = interaction.options.getRole("role")

db.config.channelId = channel.id
db.config.roleId = role.id

saveDB(db)

interaction.reply("✅ Weekly schedule configured")

}

if(interaction.commandName === "add-route"){

const day = interaction.options.getString("day").toLowerCase()
const route = interaction.options.getString("route")

db.routes[day].routes.push(route)

saveDB(db)

interaction.reply("Route added")

}

if(interaction.commandName === "remove-route"){

const day = interaction.options.getString("day").toLowerCase()
const route = interaction.options.getString("route")

db.routes[day].routes =
db.routes[day].routes.filter(r=>r!==route)

saveDB(db)

interaction.reply("Route removed")

}

if(interaction.commandName === "set-multiplier"){

const day = interaction.options.getString("day").toLowerCase()
const value = interaction.options.getString("value")

db.routes[day].multiplier = value

saveDB(db)

interaction.reply("Multiplier updated")

}

if(interaction.commandName === "view-routes"){

const day = getDay()

const data = db.routes[day]

const embed = new EmbedBuilder()
.setTitle("Today's Routes")
.setDescription(data.routes.map(r=>`• ${r}`).join("\n") || "No routes")

interaction.reply({embeds:[embed]})

}

if(interaction.commandName === "view-weekly-routes"){

let text=""

for(let d in db.routes){

text += `**${d.toUpperCase()}**
Multiplier: ${db.routes[d].multiplier}
Routes: ${db.routes[d].routes.join(", ") || "None"}

`

}

const embed = new EmbedBuilder()
.setTitle("Weekly Routes")
.setDescription(text)

interaction.reply({embeds:[embed]})

}

if(interaction.commandName === "force-send"){

sendRoutes(interaction.guild)

interaction.reply("Routes sent")

}

if(interaction.commandName === "create-ticket"){

const channel = await interaction.guild.channels.create({
name:`ticket-${interaction.user.username}`,
type:ChannelType.GuildText,
permissionOverwrites:[
{
id:interaction.guild.id,
deny:["ViewChannel"]
},
{
id:interaction.user.id,
allow:["ViewChannel","SendMessages"]
},
{
id:db.config.pilotRole,
allow:["ViewChannel"]
}
]
})

interaction.reply({content:`Ticket created ${channel}`,ephemeral:true})

}

if(interaction.commandName === "close-ticket"){

if(!interaction.channel.name.startsWith("ticket"))
return interaction.reply({content:"Not a ticket",ephemeral:true})

interaction.reply("Closing ticket")

setTimeout(()=>{
interaction.channel.delete()
},3000)

}

if(interaction.commandName === "create-event"){

const name = interaction.options.getString("name")
const date = interaction.options.getString("date")

db.events.push({name,date})

saveDB(db)

interaction.reply("Event created")

}

if(interaction.commandName === "events"){

if(!db.events.length)
return interaction.reply("No events")

const text = db.events
.map(e=>`🎉 ${e.name} — ${e.date}`)
.join("\n")

const embed = new EmbedBuilder()
.setTitle("Server Events")
.setDescription(text)

interaction.reply({embeds:[embed]})

}

})

client.login(TOKEN)
