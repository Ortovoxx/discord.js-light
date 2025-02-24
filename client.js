"use strict";

require("./init.js");
const { Constants } = require("discord.js");
const Discord = require("./classes.js");
const actions = require("./actions.js");
const pkg = require("./package.json");
const fs = require("fs");

Discord.Client = class Client extends Discord.Client {
	constructor(_options = {}) {
		const options = {
			cacheChannels: false,
			cacheGuilds: true,
			cachePresences: false,
			cacheRoles: false,
			cacheOverwrites: false,
			cacheEmojis: false,
			cacheMembers: false,
			disabledEvents: [],
			..._options
		};
		super(options);
		actions(this);
		if(options.hotreload) {
			this.ws._hotreload = {};
			if (options.sessionID && options.sequence) {
				if (!Array.isArray(options.sessionID) && !Array.isArray(options.sequence)) {
					options.sessionID = [options.sessionID];
					options.sequence = [options.sequence];
				}
				for (let shard = 0; shard < options.sessionID.length; shard++) {
					this.ws._hotreload[shard] = {
						id: options.sessionID[shard],
						seq: options.sequence[shard]
					};
				}
			}
			else {
				try {
					this.ws._hotreload = JSON.parse(fs.readFileSync(`${process.cwd()}/.sessions.json`, "utf8"));
				} catch(e) {
					this.ws._hotreload = {};
				}
			}
			this.on("shardResume", () => {
				const allReadyCondition = options.shards ?
					(options.shards.length === this.ws.shards.size) && !this.readyAt && !this.ws.shards.reduce((acc, cur) => acc + cur.status, 0) :
					!this.readyAt && !this.ws.shards.first().status;
				if (allReadyCondition) {
					this.emit(Constants.ShardEvents.READY);
				}
			});
			for(const eventType of ["exit", "uncaughtException", "SIGINT", "SIGTERM"]) {
				process.on(eventType, () => {
					try {
						this.ws._hotreload = JSON.parse(fs.readFileSync(`${process.cwd()}/.sessions.json`, "utf8"));
					} catch(e) {
						this.ws._hotreload = {};
					}
					Object.assign(this.ws._hotreload, ...this.ws.shards.map(s => {
						s.connection.close();
						return {
							[s.id]: {
								id: s.sessionID,
								seq: s.sequence
							}
						};
					}));
					fs.writeFileSync(`${process.cwd()}/.sessions.json`, JSON.stringify(this.ws._hotreload));
					if(eventType !== "exit") {
						process.exit();
					}
				});
			}
		}
	}
	sweepUsers(_lifetime = 86400) {
		const lifetime = _lifetime * 1000;
		this.users.cache.sweep(t => t.id !== this.user.id && (!t.lastMessageID || Date.now() - Discord.SnowflakeUtil.deconstruct(t.lastMessageID).timestamp > lifetime));
		for(const guild of this.guilds.cache.values()) {
			guild.members.cache.sweep(t => !this.users.cache.has(t.id));
			guild.presences.cache.sweep(t => !this.users.cache.has(t.id) && !this.options.cachePresences);
		}
	}
	sweepChannels(_lifetime = 86400) {
		const lifetime = _lifetime * 1000;
		if(this.options.cacheChannels) { return; }
		const connections = this.voice ? this.voice.connections.map(t => t.channel.id) : [];
		this.channels.cache.sweep(t => !connections.includes(t.id) && (!t.lastMessageID || Date.now() - Discord.SnowflakeUtil.deconstruct(t.lastMessageID).timestamp > lifetime));
		for(const guild of this.guilds.cache.values()) {
			guild.channels.cache.sweep(t => !this.channels.cache.has(t.id));
		}
	}
};

Discord.version = `${pkg.version} (${Discord.version})`;

module.exports = Discord;
