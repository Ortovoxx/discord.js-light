const GC = require("discord.js/src/structures/GuildChannel.js");
require.cache[require.resolve("discord.js/src/structures/GuildChannel.js")].exports = class GuildChannel extends GC {
	constructor(guild, data) {
		super({client: guild.client}, data);
		this._guildID = guild.id;
		this._shardID = guild.shardID;
		Object.defineProperty(this, "guild", {
			enumerable: false,
			get: function() {
				return this.client.guilds.cache.get(this._guildID) || this.client.guilds.add({id:this._guildID,shardID:this._shardID}, false);
			}
		});
	}
	get deletable() {
		return this.guild.roles.cache.size && this.permissionOverwrites.size ? this.permissionsFor(this.client.user).has(Discord.Permissions.FLAGS.MANAGE_CHANNELS, false) : false;
	}
}

const Action = require("discord.js/src/client/actions/Action.js");
Action.prototype.getPayload = function(data, manager, id, partialType, cache) {
	const existing = manager.cache.get(id);
	if(!existing) {
		return manager.add(data, cache);
	}
	return existing;
}

const { Error, TypeError, RangeError } = require("discord.js/src/errors");
const Discord = require("discord.js");
const util = require("util");

Discord.Structures.extend("Message", M => {
	return class Message extends M {
		constructor(client, data, channel) {
			let d = {};
			let list = ["author","member","mentions","mention_roles"];
			for(let i in data) {
				if(!list.includes(i)) { d[i] = data[i]; }
			}
			super(client, d, channel);
			if(data.author) {
				if(data.author instanceof Discord.User) {
					this.author = data.author;
				} else {
					this.author = client.users.add(data.author,client.users.cache.has(data.author.id));
				}
			}
			if(this.guild && data.member) {
				if(this.guild.members.cache.has(data.author.id)) {
					this.member._patch(data.member);
				} else {
					if(data.member instanceof Discord.GuildMember) {
						this._member = data.member;
					} else {
						this._member = this.guild.members.add(Object.assign(data.member,{user:this.author}),false);
					}
				}
			}
			if(data.mentions && data.mentions.length) {
				for(let mention of data.mentions) {
					this.mentions.users.set(mention.id,client.users.cache.get(mention.id) || client.users.add(mention,false));
					if(mention.member && this.guild) {
						if(!this.mentions._members) { this.mentions._members = {} }
						this.mentions._members[mention.id] = mention.member;
					}
				}
			}
			if(data.mention_roles && data.mention_roles.length && this.guild) {
				for(let role of data.mention_roles) {
					this.mentions.roles.set(role,this.guild.roles.cache.get(role) || this.guild.roles.add({id:role},false));
				}
			}
		}
		get member() {
			if(!this.guild) { return null; }
			return this.guild.members.cache.get((this.author || {}).id || (this._member || {}).id) || this._member || null;
		}
		get pinnable() {
			if(this.guild && (!this.guild.roles.cache.size || !this.channel.permissionOverwrites.size)) { return false; }
			return this.type === Discord.Constants.MessageTypes[0] && (!this.guild || this.channel.permissionsFor(this.client.user).has(Discord.Permissions.FLAGS.MANAGE_MESSAGES, false));
		}
		get deletable() {
			if(!this.guild || !this.guild.roles.cache.size || !this.channel.permissionOverwrites.size) { return false; }
			return !this.deleted && (this.author.id === this.client.user.id || (this.guild && this.channel.permissionsFor(this.client.user).has(Discord.Permissions.FLAGS.MANAGE_MESSAGES, false)));
		}
	}
});

Discord.Structures.extend("GuildMember", G => {
	return class GuildMember extends G {
		constructor(client, data, guild) {
			let d = {};
			for(let i in data) {
				if(i !== "user") { d[i] = data[i]; }
			}
			super(client, d, guild);
			if(data.user) {
				if(data.user instanceof Discord.User) {
					if(data._cache && !client.users.cache.has(data.user.id)) { client.users.cache.set(data.user.id, data.user); }
					this.user = data.user;
				} else {
					this.user = client.users.add(data.user, data._cache);
				}
			}
		}
		equals(member) {
			return member && this.deleted === member.deleted && this.nickname === member.nickname && this.roles.cache.size === member.roles.cache.size;
		}
	}
});

Discord.Structures.extend("Guild", G => {
	return class Guild extends G {
		constructor(client,data) {
			super(client,data);
		}
		get nameAcronym() {
			return this.name ? this.name.replace(/\w+/g, name => name[0]).replace(/\s/g, '') : undefined;
		}
		get joinedAt() {
			return this.joinedTimestamp ? new Date(this.joinedTimestamp) : undefined;
		}
		_patch(data) {
			this.shardID = data.shardID;
			this.emojis = new Discord.GuildEmojiManager(this);
			let d = {};
			for(let key in data) {
				if(!["channels","roles","members","presences","voice_states","emojis"].includes(key)) {
					d[key] = data[key];
				}
			}
			super._patch(d);
			if(data.channels && Array.isArray(data.channels)) {
				if(this.client.options.cacheChannels) { this.channels.cache.clear(); }
				for(let channel of data.channels) {
					if(this.client.options.cacheChannels || this.client.channels.cache.has(channel.id) || (this.client.options.ws.intents & 128 && data.voice_states && data.voice_states.find(v => v.channel_id === channel.id))) {
						this.client.channels.add(channel, this);
					}
				}
			}
			if(data.roles && Array.isArray(data.roles) && (this.roles.cache.size || this.client.options.cacheRoles)) {
				this.roles.cache.clear();
				for(let role of data.roles) {
					this.roles.add(role);
				}
			}
			if(data.members && Array.isArray(data.members)) {
				for(let member of data.members) {
					if(this.client.users.cache.has(member.user.id)) {
						this.members.add(member);
					}
				}
			}
			if(data.presences && Array.isArray(data.presences)) {
				for(let presence of data.presences) {
					if(this.client.users.cache.has(presence.user.id) || this.client.options.cachePresences) {
						this.presences.add(Object.assign(presence, { guild: this }));
					}
				}
			}
			if(data.voice_states && Array.isArray(data.voice_states) && this.client.options.ws.intents & 128) {
				this.voiceStates.cache.clear();
				for(let voiceState of data.voice_states) {
					this.voiceStates.add(voiceState);
				}
			}
			if(data.emojis && Array.isArray(data.emojis) && (this.emojis.cache.size || this.client.options.cacheEmojis)) {
				this.client.actions.GuildEmojisUpdate.handle({
					guild_id: this.id,
					emojis: data.emojis,
				});
			}
		}
	}
});

Discord.Structures.extend("VoiceChannel", V => {
	return class VoiceChannel extends V {
		get joinable() {
			if(Discord.Constants.browser) return false;
			if((!this.guild.roles.cache.size && !this.client.options.cacheRoles) || (!this.permissionOverwrites.size && !this.client.options.cacheOverwrites)) return true;
			if(!this.viewable) return false;
			if(!this.permissionsFor(this.client.user).has(Discord.Permissions.FLAGS.CONNECT, false)) return false;
			if(this.full && !this.permissionsFor(this.client.user).has(Discord.Permissions.FLAGS.MOVE_MEMBERS, false)) return false;
			return true;
		}
		async join() {
			if(Discord.Constants.browser) return Promise.reject(new Error('VOICE_NO_BROWSER'));
			let channel = await this.client.channels.fetch(this.id);
			return this.client.voice.joinChannel(channel);
		}
		leave() {
			if(Discord.Constants.browser) return;
			const connection = this.client.voice.connections.get(this.guild.id);
			if(connection && connection.channel.id === this.id) { connection.disconnect(); }
			if(!this.client.options.cacheChannels) { this.client.channels.remove(this.id); }
		}
	}
});

Discord.Structures.extend("DMChannel", D => {
	return class DMChannel extends D {
		_patch(data) {
			let d = {}
			for(let i in data) {
				if(i !== "recipients") { d[i] = data[i]; }
			}
			super._patch(d);
			if(data.recipients) {
				this.recipient = this.client.users.cache.get(data.recipients[0].id) || this.client.users.add(data.recipients[0],false);
			}
		}
	}
});

Discord.Channel.create = (client, data, guild) => {
	let channel;
	if(!data.guild_id && !guild) {
		if((data.recipients && data.type !== Discord.Constants.ChannelTypes.GROUP) || data.type === Discord.Constants.ChannelTypes.DM) {
			const DMChannel = Discord.Structures.get('DMChannel');
			channel = new DMChannel(client, data);
		} else if(data.type === Discord.Constants.ChannelTypes.GROUP) {
			const PartialGroupDMChannel = require('discord.js/src/structures/PartialGroupDMChannel.js');
			channel = new PartialGroupDMChannel(client, data);
		}
	} else {
		guild = guild || client.guilds.cache.get(data.guild_id) || client.guilds.add({id:data.guild_id,shardID:data.shardID},false);
		if(guild) {
			switch(data.type) {
				case Discord.Constants.ChannelTypes.TEXT: {
					let TextChannel = Discord.Structures.get('TextChannel');
					channel = new TextChannel(guild, data);
					break;
				}
					case Discord.Constants.ChannelTypes.VOICE: {
					let VoiceChannel = Discord.Structures.get('VoiceChannel');
					channel = new VoiceChannel(guild, data);
					break;
				}
					case Discord.Constants.ChannelTypes.CATEGORY: {
					let CategoryChannel = Discord.Structures.get('CategoryChannel');
					channel = new CategoryChannel(guild, data);
					break;
				}
					case Discord.Constants.ChannelTypes.NEWS: {
					let NewsChannel = Discord.Structures.get('NewsChannel');
					channel = new NewsChannel(guild, data);
					break;
				}
					case Discord.Constants.ChannelTypes.STORE: {
					let StoreChannel = Discord.Structures.get('StoreChannel');
					channel = new StoreChannel(guild, data);
					break;
				}
			}
		}
	}
	return channel;
}

Discord.GuildManager.prototype.fetch = async function(id, cache = true) {
	let guild = await this.client.api.guilds(id).get();
	return this.add(guild,cache);
}

Discord.ChannelManager.prototype.add = function(data, guild, cache = true) {
	if(data.permission_overwrites && !data._withOverwrites && !this.client.options.cacheOverwrites) {
		let g = this.client.guilds.cache.get(data.guild_id);
		if(!g || !g.roles.cache.size) {
			data.permission_overwrites = [];
		}
	}
	const existing = this.cache.get(data.id);
	if(existing && !(data._withOverwrites && !existing.permissionOverwrites.size && !cache)) {
		if(existing._patch && cache) { existing._patch(data); }
		if(existing.guild) { existing.guild.channels.add(existing); }
		return existing;
	}
	const channel = Discord.Channel.create(this.client, data, guild);
	if(!channel) {
		this.client.emit(Discord.Constants.Events.DEBUG, `Failed to find guild, or unknown type for channel ${data.id} ${data.type}`);
		return null;
	}
	if(cache) {
		this.cache.set(channel.id, channel);
		let g = channel.guild;
		if(g && this.client.guilds.cache.has(g.id)) {
			this.client.guilds.cache.get(g.id).channels.add(channel);
		}
	}
	return channel;
}
Discord.ChannelManager.prototype._guilds = {};

Discord.ChannelManager.prototype.fetch = async function(id, cache = true, withOverwrites) {
	let existing = this.cache.get(id);
	if(existing && !existing.partial && (!existing.guild || !withOverwrites || existing.permissionOverwrites.size)) { return existing; }
	let data = await this.client.api.channels(id).get();
	if(withOverwrites !== undefined) { data._withOverwrites = Boolean(withOverwrites); }
	return this.add(data, null, cache);
}

Discord.GuildChannelManager.prototype.fetch = async function(id, cache = true, withOverwrites) {
	if(arguments.length < 3 && typeof arguments[0] !== "string") {
		withOverwrites = arguments[1];
		cache = arguments[0] || true;
	}
	if(id) {
		let existing = this.cache.get(id);
		if(existing && !existing.partial && (!withOverwrites || existing.permissionOverwrites.size)) { return existing; }
	}
	let channels = await this.client.api.guilds(this.guild.id).channels().get();
	if(id) {
		let c = channels.find(t => t.id === id);
		if(!c) { throw new Discord.DiscordAPIError(this.client.api.guilds(this.guild.id).channels() + ":id", {message:"Unknown Channel"}, "GET", 404) }
		if(withOverwrites) { c._withOverwrites = true; }
		return this.client.channels.add(c, this.guild, cache);
	}
	if(cache) {
		for(let channel of channels) {
			if(withOverwrites) { channel._withOverwrites = true; }
			let c = this.client.channels.add(channel, this.guild);
		}
		return this.cache;
	} else {
		let collection = new Discord.Collection();
		for(let channel of channels) {
			if(withOverwrites) { channel._withOverwrites = true; }
			let c = this.client.channels.add(channel, this.guild, false);
			collection.set(c.id, c);
		}
		return collection;
	}
}

Discord.GuildMemberManager.prototype.add = function(data, cache = true) {
	data._cache = cache;
	return Object.getPrototypeOf(this.constructor.prototype).add.call(this, data, cache, { id: data.user.id, extras: [this.guild] });
}

Discord.GuildMemberManager.prototype.fetch = async function(options = {}) {
	if(options.cache === undefined) { options.cache = true; }
	if(options.rest) {
		if(typeof options.id === "string") {
			let existing = this.cache.get(options.id);
			if(existing && !existing.partial) return Promise.resolve(existing);
			let member = await this.client.api.guilds(this.guild.id).members(options.id).get();
			return this.add(member, Boolean(options.cache));
		} else {
			let opts = `?limit=${Number.isInteger(options.limit) ? options.limit : 50}&after=${options.after || 0}`;
			let members = await this.client.api.guilds(this.guild.id)["members"+opts].get();
			let c = new Discord.Collection();
			for(let member of members) {
				c.set(member.user.id, this.add(member, Boolean(options.cache)));
			}
			return c;
		}
	} else {
		return new Promise((r,j) => {
			let user_ids = options.id || (Array.isArray(options.ids) ? options.ids : undefined);
			let query = options.query;
			let time = options.time || 60000;
			let limit = Number.isInteger(options.limit) ? options.limit : 0;
			let presences = options.withPresences || false;
			let nonce = Date.now().toString(16);
			if(nonce.length > 32) { return j(new RangeError('MEMBER_FETCH_NONCE_LENGTH')); }
			if(!query && !user_ids) { query = ""; }
			if(this.guild.memberCount === this.cache.size && !query && !limit && !presences && !user_ids) {
				return r(this.cache);
			}
			if(typeof user_ids === "string" && this.cache.has(user_ids)) {
				return r(this.cache.get(user_ids));
			}
			if(Array.isArray(user_ids) && user_ids.every(t => this.cache.has(t))) {
				return r(user_ids.map(t => this.cache.get(t)));
			}
			this.guild.shard.send({
				op: Discord.Constants.OPCodes.REQUEST_GUILD_MEMBERS,
				d: {
					guild_id: this.guild.id,
					presences,
					user_ids,
					query,
					nonce,
					limit,
				},
			});
			let fetched = new Discord.Collection();
			let i = 0;
			let failed = 0;
			let timeout = this.client.setTimeout(() => {
				this.client.removeListener(Discord.Constants.Events.GUILD_MEMBERS_CHUNK, handler);
				this.client.decrementMaxListeners();
				j(new Error('GUILD_MEMBERS_TIMEOUT'));
			}, time);
			let handler = (guild, data) => {
				if(data.nonce !== nonce) return;
				timeout.refresh();
				i++;
				if(data.not_found) { failed += data.not_found.length; }
				for(let member of data.members) {
					fetched.set(member.user.id, this.add(member, Boolean(options.cache)));
				}
				if(presences && data.presences) {
					for(let presence of data.presences) {
						if(this.client.options.cachePresences || this.guild.members.cache.has(presence.user.id)) {
							this.guild.presences.add(Object.assign(presence, { guild: this.guild }));
						}
					}
				}
				if(
					fetched.size >= this.guild.memberCount ||
					(limit && fetched.size >= limit) ||
					(typeof user_ids === "string" && fetched.size + failed === 1) ||
					(Array.isArray(user_ids) && user_ids.length === fetched.size + failed) ||
					i === data.chunk_count
				) {
					this.client.clearTimeout(timeout);
					this.client.removeListener(Discord.Constants.Events.GUILD_MEMBERS_CHUNK, handler);
					this.client.decrementMaxListeners();
					if(typeof user_ids === "string") {
						let result = fetched.first();
						if(result) {
							r(result);
						} else {
							j(new Discord.DiscordAPIError("GUILD_MEMBERS_CHUNK", {message:"Unknown User"}, "Gateway"))
						}
					} else {
						r(fetched);
					}
				}
			}
			this.client.incrementMaxListeners();
			this.client.on(Discord.Constants.Events.GUILD_MEMBERS_CHUNK, handler);
		});
	}
}

Discord.GuildEmojiManager.prototype.fetch = async function(id, cache = true) {
	if(arguments.length < 2 && typeof arguments[0] !== "string") {
		cache = arguments[0] || true;
	}
	if(id) {
		let existing = this.cache.get(id);
		if(existing) { return existing; }
	}
	let emojis = await this.client.api.guilds(this.guild.id).emojis().get();
	if(id) {
		let e = emojis.find(t => t.id === id);
		if(!e) { throw new Discord.DiscordAPIError(this.client.api.guilds(this.guild.id).emojis() + ":id", {message:"Unknown Emoji"}, "GET", 404) }
		return this.add(e, cache);
	} else if(cache) {
		for(let emoji of emojis) {
			this.add(emoji);
		}
		return this.cache;
	} else {
		let collection = new Discord.Collection();
		for(let emoji of emojis) {
			collection.set(emoji.id, this.add(emoji, false));
		}
		return collection;
	}
}

Discord.RoleManager.prototype.fetch = async function(id, cache = true) {
	if(arguments.length < 2 && typeof arguments[0] !== "string") {
		cache = arguments[0] || true;
	}
	if(id) {
		let existing = this.cache.get(id);
		if(existing) { return existing; }
	}
	let roles = await this.client.api.guilds(this.guild.id).roles.get();
	if(id) {
		let r = roles.find(t => t.id === id);
		if(!r) { throw new Discord.DiscordAPIError(this.client.api.guilds(this.guild.id).roles() + ":id", {message:"Unknown Role"}, "GET", 404) }
		return this.add(r, cache);
	} else if(cache) {
		for(let role of roles) {
			this.add(role);
		}
		return this.cache;
	} else {
		let collection = new Discord.Collection();
		for(let role of roles) {
			collection.set(role.id, this.add(role, false));
		}
		return collection;
	}
}

Object.defineProperty(Discord.RoleManager.prototype, "everyone", {
	get: function() {
		return this.cache.get(this.guild.id) || this.guild.roles.add({id:this.guild.id},false);
	}
});

Object.defineProperty(Discord.GuildMemberRoleManager.prototype, "_roles", {
	get: function() {
		let everyone = this.guild.roles.everyone;
		let roles = new Discord.Collection();
		roles.set(everyone.id, everyone);
		for(let role of this.member._roles) {
			roles.set(role, this.guild.roles.cache.get(role) || this.guild.roles.add({id:role},false));
		}
		return roles;
	}
});

Object.defineProperty(Discord.MessageMentions.prototype, "channels", {
	get: function() {
		this._channels = new Discord.Collection();
		let matches;
		while((matches = this.constructor.CHANNELS_PATTERN.exec(this._content)) !== null) {
			let chan = this.client.channels.cache.get(matches[1]) || this.client.channels.add({id:matches[1],type:this.guild?0:1}, this.guild, false);
			this._channels.set(chan.id, chan);
		}
		return this._channels;
	}
});

Object.defineProperty(Discord.MessageMentions.prototype, "members", {
	get: function() {
		if(!this.guild) return null;
		if(!this._members) { this._members = {}; }
		let members = new Discord.Collection();
		for(let id in this._members) {
			let member = this.guild.members.cache.get(id) || this.guild.members.add(Object.assign(this._members[id],{user:this.client.users.cache.get(id) || this.users.get(id)}),false);
			members.set(id,member);
		}
		return members
	}
});

module.exports = Discord;