import { useEffect, useRef, useState } from 'react';
import { DbConnection } from '../generated';
import type {
    Message,
    PlayerPin,
    ActiveConnection,
    TutorialQuestDefinition,
    DailyQuestDefinition,
    PlayerTutorialProgress,
    PlayerDailyQuest,
    QuestCompletionNotification,
    QuestProgressNotification,
    SovaQuestMessage,
    BeaconDropEvent,
} from '../generated/types';
import { runtimeEngine } from '../engine/runtimeEngine';
import { subscribeUiQueries } from '../engine/adapters/spacetime/uiSubscriptions';
import { unsubscribeAll } from '../engine/adapters/spacetime/nonSpatialSubscriptions';

type SubscriptionHandle = { unsubscribe: () => void } | null;

export interface UISubscriptionStates {
    messages: Map<string, Message>;
    playerPins: Map<string, PlayerPin>;
    activeConnections: Map<string, ActiveConnection>;
    matronages: Map<string, any>;
    matronageMembers: Map<string, any>;
    matronageInvitations: Map<string, any>;
    matronageOwedShards: Map<string, any>;
    tutorialQuestDefinitions: Map<string, TutorialQuestDefinition>;
    dailyQuestDefinitions: Map<string, DailyQuestDefinition>;
    playerTutorialProgress: Map<string, PlayerTutorialProgress>;
    playerDailyQuests: Map<string, PlayerDailyQuest>;
    questCompletionNotifications: Map<string, QuestCompletionNotification>;
    questProgressNotifications: Map<string, QuestProgressNotification>;
    sovaQuestMessages: Map<string, SovaQuestMessage>;
    beaconDropEvents: Map<string, BeaconDropEvent>;
}

export const useUISubscriptions = (connection: DbConnection | null): UISubscriptionStates => {
    const [messages, setMessages] = useState<Map<string, Message>>(() => new Map());
    const [playerPins, setPlayerPins] = useState<Map<string, PlayerPin>>(() => new Map());
    const [activeConnections, setActiveConnections] = useState<Map<string, ActiveConnection>>(() => new Map());

    const [matronages, setMatronages] = useState<Map<string, any>>(() => new Map());
    const [matronageMembers, setMatronageMembers] = useState<Map<string, any>>(() => new Map());
    const [matronageInvitations, setMatronageInvitations] = useState<Map<string, any>>(() => new Map());
    const [matronageOwedShards, setMatronageOwedShards] = useState<Map<string, any>>(() => new Map());

    const [tutorialQuestDefinitions, setTutorialQuestDefinitions] = useState<Map<string, TutorialQuestDefinition>>(() => new Map());
    const [dailyQuestDefinitions, setDailyQuestDefinitions] = useState<Map<string, DailyQuestDefinition>>(() => new Map());
    const [playerTutorialProgress, setPlayerTutorialProgress] = useState<Map<string, PlayerTutorialProgress>>(() => new Map());
    const [playerDailyQuests, setPlayerDailyQuests] = useState<Map<string, PlayerDailyQuest>>(() => new Map());
    const [questCompletionNotifications, setQuestCompletionNotifications] = useState<Map<string, QuestCompletionNotification>>(() => new Map());
    const [questProgressNotifications, setQuestProgressNotifications] = useState<Map<string, QuestProgressNotification>>(() => new Map());
    const [sovaQuestMessages, setSovaQuestMessages] = useState<Map<string, SovaQuestMessage>>(() => new Map());
    const [beaconDropEvents, setBeaconDropEvents] = useState<Map<string, BeaconDropEvent>>(() => new Map());

    const subscribedRef = useRef(false);
    const subsRef = useRef<SubscriptionHandle[]>([]);

    useEffect(() => {
        if (!connection || subscribedRef.current) return;
        subscribedRef.current = true;

        const registerTableCallbacks = (table: any, handlers: { onInsert?: (...args: any[]) => void; onUpdate?: (...args: any[]) => void; onDelete?: (...args: any[]) => void; }) => {
            if (handlers.onInsert) table.onInsert(handlers.onInsert);
            if (handlers.onUpdate) table.onUpdate(handlers.onUpdate);
            if (handlers.onDelete) table.onDelete(handlers.onDelete);
        };

        registerTableCallbacks(connection.db.message, {
            onInsert: (ctx: any, msg: Message) => setMessages(prev => new Map(prev).set(msg.id.toString(), msg)),
            onUpdate: (ctx: any, oldMsg: Message, newMsg: Message) => setMessages(prev => new Map(prev).set(newMsg.id.toString(), newMsg)),
            onDelete: (ctx: any, msg: Message) => setMessages(prev => { const next = new Map(prev); next.delete(msg.id.toString()); return next; }),
        });

        registerTableCallbacks(connection.db.player_pin, {
            onInsert: (ctx: any, pin: PlayerPin) => setPlayerPins(prev => new Map(prev).set(pin.playerId.toHexString(), pin)),
            onUpdate: (ctx: any, oldPin: PlayerPin, newPin: PlayerPin) => setPlayerPins(prev => new Map(prev).set(newPin.playerId.toHexString(), newPin)),
            onDelete: (ctx: any, pin: PlayerPin) => setPlayerPins(prev => { const next = new Map(prev); next.delete(pin.playerId.toHexString()); return next; }),
        });

        registerTableCallbacks(connection.db.active_connection, {
            onInsert: (ctx: any, conn: ActiveConnection) => setActiveConnections(prev => new Map(prev).set(conn.identity.toHexString(), conn)),
            onDelete: (ctx: any, conn: ActiveConnection) => setActiveConnections(prev => { const next = new Map(prev); next.delete(conn.identity.toHexString()); return next; }),
        });

        registerTableCallbacks(connection.db.matronage, {
            onInsert: (ctx: any, matronage: any) => setMatronages(prev => new Map(prev).set(matronage.id.toString(), matronage)),
            onUpdate: (ctx: any, oldMatronage: any, newMatronage: any) => setMatronages(prev => new Map(prev).set(newMatronage.id.toString(), newMatronage)),
            onDelete: (ctx: any, matronage: any) => setMatronages(prev => { const next = new Map(prev); next.delete(matronage.id.toString()); return next; }),
        });

        registerTableCallbacks(connection.db.matronage_member, {
            onInsert: (ctx: any, member: any) => setMatronageMembers(prev => new Map(prev).set(member.playerId.toHexString(), member)),
            onUpdate: (ctx: any, oldMember: any, newMember: any) => setMatronageMembers(prev => new Map(prev).set(newMember.playerId.toHexString(), newMember)),
            onDelete: (ctx: any, member: any) => setMatronageMembers(prev => { const next = new Map(prev); next.delete(member.playerId.toHexString()); return next; }),
        });

        registerTableCallbacks(connection.db.matronage_invitation, {
            onInsert: (ctx: any, invitation: any) => setMatronageInvitations(prev => new Map(prev).set(invitation.id.toString(), invitation)),
            onUpdate: (ctx: any, oldInvitation: any, newInvitation: any) => setMatronageInvitations(prev => new Map(prev).set(newInvitation.id.toString(), newInvitation)),
            onDelete: (ctx: any, invitation: any) => setMatronageInvitations(prev => { const next = new Map(prev); next.delete(invitation.id.toString()); return next; }),
        });

        registerTableCallbacks(connection.db.matronage_owed_shards, {
            onInsert: (ctx: any, owed: any) => setMatronageOwedShards(prev => new Map(prev).set(owed.playerId.toHexString(), owed)),
            onUpdate: (ctx: any, oldOwed: any, newOwed: any) => setMatronageOwedShards(prev => new Map(prev).set(newOwed.playerId.toHexString(), newOwed)),
            onDelete: (ctx: any, owed: any) => setMatronageOwedShards(prev => { const next = new Map(prev); next.delete(owed.playerId.toHexString()); return next; }),
        });

        registerTableCallbacks(connection.db.tutorial_quest_definition, {
            onInsert: (ctx: any, def: TutorialQuestDefinition) => setTutorialQuestDefinitions(prev => new Map(prev).set(def.id, def)),
            onUpdate: (ctx: any, oldDef: TutorialQuestDefinition, newDef: TutorialQuestDefinition) => setTutorialQuestDefinitions(prev => new Map(prev).set(newDef.id, newDef)),
            onDelete: (ctx: any, def: TutorialQuestDefinition) => setTutorialQuestDefinitions(prev => { const next = new Map(prev); next.delete(def.id); return next; }),
        });

        registerTableCallbacks(connection.db.daily_quest_definition, {
            onInsert: (ctx: any, def: DailyQuestDefinition) => setDailyQuestDefinitions(prev => new Map(prev).set(def.id, def)),
            onUpdate: (ctx: any, oldDef: DailyQuestDefinition, newDef: DailyQuestDefinition) => setDailyQuestDefinitions(prev => new Map(prev).set(newDef.id, newDef)),
            onDelete: (ctx: any, def: DailyQuestDefinition) => setDailyQuestDefinitions(prev => { const next = new Map(prev); next.delete(def.id); return next; }),
        });

        registerTableCallbacks(connection.db.player_tutorial_progress, {
            onInsert: (ctx: any, progress: PlayerTutorialProgress) => {
                if (connection.identity && progress.playerId.toHexString() === connection.identity.toHexString()) {
                    setPlayerTutorialProgress(prev => new Map(prev).set(progress.playerId.toHexString(), progress));
                }
            },
            onUpdate: (ctx: any, oldProgress: PlayerTutorialProgress, newProgress: PlayerTutorialProgress) => {
                if (connection.identity && newProgress.playerId.toHexString() === connection.identity.toHexString()) {
                    setPlayerTutorialProgress(prev => new Map(prev).set(newProgress.playerId.toHexString(), newProgress));
                }
            },
            onDelete: (ctx: any, progress: PlayerTutorialProgress) => {
                if (connection.identity && progress.playerId.toHexString() === connection.identity.toHexString()) {
                    setPlayerTutorialProgress(prev => { const next = new Map(prev); next.delete(progress.playerId.toHexString()); return next; });
                }
            },
        });

        registerTableCallbacks(connection.db.player_daily_quest, {
            onInsert: (ctx: any, quest: PlayerDailyQuest) => {
                if (connection.identity && quest.playerId.toHexString() === connection.identity.toHexString()) {
                    setPlayerDailyQuests(prev => new Map(prev).set(quest.id.toString(), quest));
                }
            },
            onUpdate: (ctx: any, oldQuest: PlayerDailyQuest, newQuest: PlayerDailyQuest) => {
                if (connection.identity && newQuest.playerId.toHexString() === connection.identity.toHexString()) {
                    setPlayerDailyQuests(prev => new Map(prev).set(newQuest.id.toString(), newQuest));
                }
            },
            onDelete: (ctx: any, quest: PlayerDailyQuest) => {
                if (connection.identity && quest.playerId.toHexString() === connection.identity.toHexString()) {
                    setPlayerDailyQuests(prev => { const next = new Map(prev); next.delete(quest.id.toString()); return next; });
                }
            },
        });

        registerTableCallbacks(connection.db.quest_completion_notification, {
            onInsert: (ctx: any, notif: QuestCompletionNotification) => {
                if (connection.identity && notif.playerId.toHexString() === connection.identity.toHexString()) {
                    setQuestCompletionNotifications(prev => new Map(prev).set(notif.id.toString(), notif));
                }
            },
            onDelete: (ctx: any, notif: QuestCompletionNotification) => {
                if (connection.identity && notif.playerId.toHexString() === connection.identity.toHexString()) {
                    setQuestCompletionNotifications(prev => { const next = new Map(prev); next.delete(notif.id.toString()); return next; });
                }
            },
        });

        registerTableCallbacks(connection.db.quest_progress_notification, {
            onInsert: (ctx: any, notif: QuestProgressNotification) => {
                if (connection.identity && notif.playerId.toHexString() === connection.identity.toHexString()) {
                    setQuestProgressNotifications(prev => new Map(prev).set(notif.id.toString(), notif));
                }
            },
            onDelete: (ctx: any, notif: QuestProgressNotification) => {
                if (connection.identity && notif.playerId.toHexString() === connection.identity.toHexString()) {
                    setQuestProgressNotifications(prev => { const next = new Map(prev); next.delete(notif.id.toString()); return next; });
                }
            },
        });

        registerTableCallbacks(connection.db.sova_quest_message, {
            onInsert: (ctx: any, msg: SovaQuestMessage) => {
                if (connection.identity && msg.playerId.toHexString() === connection.identity.toHexString()) {
                    setSovaQuestMessages(prev => new Map(prev).set(msg.id.toString(), msg));
                }
            },
            onDelete: (ctx: any, msg: SovaQuestMessage) => {
                if (connection.identity && msg.playerId.toHexString() === connection.identity.toHexString()) {
                    setSovaQuestMessages(prev => { const next = new Map(prev); next.delete(msg.id.toString()); return next; });
                }
            },
        });

        registerTableCallbacks(connection.db.beacon_drop_event, {
            onInsert: (ctx: any, event: BeaconDropEvent) => setBeaconDropEvents(prev => new Map(prev).set(event.id.toString(), event)),
            onUpdate: (ctx: any, oldEvent: BeaconDropEvent, newEvent: BeaconDropEvent) => setBeaconDropEvents(prev => new Map(prev).set(newEvent.id.toString(), newEvent)),
            onDelete: (ctx: any, event: BeaconDropEvent) => setBeaconDropEvents(prev => { const next = new Map(prev); next.delete(event.id.toString()); return next; }),
        });

        subsRef.current = subscribeUiQueries(connection);

        return () => {
            unsubscribeAll(subsRef.current);
            subsRef.current = [];
            subscribedRef.current = false;
            setMessages(new Map());
            setPlayerPins(new Map());
            setActiveConnections(new Map());
            setMatronages(new Map());
            setMatronageMembers(new Map());
            setMatronageInvitations(new Map());
            setMatronageOwedShards(new Map());
            setTutorialQuestDefinitions(new Map());
            setDailyQuestDefinitions(new Map());
            setPlayerTutorialProgress(new Map());
            setPlayerDailyQuests(new Map());
            setQuestCompletionNotifications(new Map());
            setQuestProgressNotifications(new Map());
            setSovaQuestMessages(new Map());
            setBeaconDropEvents(new Map());
        };
    }, [connection]);

    useEffect(() => {
        runtimeEngine.updateSnapshot((current) => ({
            ...current,
            ui: {
                ...current.ui,
                uiTables: {
                    ...current.ui.uiTables,
                    messages,
                    playerPins,
                    activeConnections,
                    matronages,
                    matronageMembers,
                    matronageInvitations,
                    matronageOwedShards,
                    tutorialQuestDefinitions,
                    dailyQuestDefinitions,
                    playerTutorialProgress,
                    playerDailyQuests,
                    questCompletionNotifications,
                    questProgressNotifications,
                    sovaQuestMessages,
                    beaconDropEvents,
                },
            },
        }));
    }, [
        messages,
        playerPins,
        activeConnections,
        matronages,
        matronageMembers,
        matronageInvitations,
        matronageOwedShards,
        tutorialQuestDefinitions,
        dailyQuestDefinitions,
        playerTutorialProgress,
        playerDailyQuests,
        questCompletionNotifications,
        questProgressNotifications,
        sovaQuestMessages,
        beaconDropEvents,
    ]);

    return {
        messages,
        playerPins,
        activeConnections,
        matronages,
        matronageMembers,
        matronageInvitations,
        matronageOwedShards,
        tutorialQuestDefinitions,
        dailyQuestDefinitions,
        playerTutorialProgress,
        playerDailyQuests,
        questCompletionNotifications,
        questProgressNotifications,
        sovaQuestMessages,
        beaconDropEvents,
    };
};
