import { VoiceChannel } from "discord.js";
import { inject, Lifecycle, scoped, singleton } from "tsyringe";
import { ActivityTrackingVoiceConnection, Duration, execute } from "../utils";

/**
 * Manages mapping guild to it's respective voice connection.
 *
 * Singleton.
 * @category Service
 */
@singleton()
export class VoiceConnectionService {
    private guildConnectionMap: { [id: string]: ActivityTrackingVoiceConnection } = {};

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    constructor() {}

    /**
     * Gets an existing voice connection.
     *
     * * Prefer using `getOrCreateConnectionForGuild` unless you want this to fail
     * * on attempt potentially, or if you know the connection exists.
     * @param guildId Guild id to lookup voice connection for.
     * @throws If connection does not exist.
     */
    public getConnectionForGuild(guildId: string): ActivityTrackingVoiceConnection {
        if (!this.guildConnectionMap[guildId]) {
            throw new Error("Not in any channels");
        }
        const connection = this.guildConnectionMap[guildId];
        return connection;
    }

    /** How long before the service closes the connection. */
    static readonly DisconnectAfterInactiveForDuration: Duration = Duration.fromMinutes(5);

    /**
     * Gets or creates an existing voice channel.
     *
     * Will disconnect if inactive for {@link DisconnectAfterInactiveForDuration} seconds.
     * @param guildId Guild id to lookup voice connection for.
     * @param channelToUseIfNotInExisting Channel to join if connection does not exist.
     */
    public async getOrCreateConnectionForGuild(
        guildId: string,
        channelToUseIfNotInExisting: VoiceChannel
    ): Promise<ActivityTrackingVoiceConnection> {
        if (!this.guildConnectionMap[guildId]) {
            this.guildConnectionMap[guildId] = ActivityTrackingVoiceConnection.wrapConnection(
                await channelToUseIfNotInExisting.join()
            ).whenInactiveForDuration(VoiceConnectionService.DisconnectAfterInactiveForDuration, self => {
                self.disconnect();
                delete this.guildConnectionMap[guildId];
            });
        }
        return this.guildConnectionMap[guildId];
    }

    /**
     * Disconnect from voice in guild, if currently in a channel.
     * @param guildId Guild id of which guild to disconnect from if in a voice channel.
     */
    public disconnect(guildId: string): void {
        const connection = this.guildConnectionMap[guildId];
        if (connection) {
            connection.disconnect();
            (this.guildOnDisconnects[guildId] || []).forEach(execute);
            delete this.guildConnectionMap[guildId];
            delete this.guildOnDisconnects[guildId];
        }
    }

    private guildOnDisconnects: { [id: string]: Array<Callback> } = {};
    /**
     * Add a callback to be called when this service disconnects from a channel.
     * @param guildId Guild id of which guild to subscribe to.
     * @param callback Callback that will be called when voice channel is disconnected to.
     */
    public subscribeToDisconnect(guildId: string, callback: Callback): void {
        if (!this.guildOnDisconnects[guildId]) {
            this.guildOnDisconnects[guildId] = [];
        }
        this.guildOnDisconnects[guildId].push(callback);
    }
}

@scoped(Lifecycle.ResolutionScoped)
export class GuildScopedVoiceConnectionService {
    constructor(
        @inject(VoiceConnectionService) private readonly voiceConnectionService: VoiceConnectionService,
        @inject("GuildId") private readonly guildId: string
    ) {}

    getConnection(): ActivityTrackingVoiceConnection {
        return this.voiceConnectionService.getConnectionForGuild(this.guildId);
    }

    getOrCreateConnection(channelToUseIfNotInExisting: VoiceChannel): Promise<ActivityTrackingVoiceConnection> {
        return this.voiceConnectionService.getOrCreateConnectionForGuild(this.guildId, channelToUseIfNotInExisting);
    }

    disconnect(): void {
        this.voiceConnectionService.disconnect(this.guildId);
    }

    subscribeToDisconnect(callback: Callback): void {
        this.voiceConnectionService.subscribeToDisconnect(this.guildId, callback);
    }
}
