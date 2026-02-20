import { useEffect, useRef, useState } from 'react';
import * as SpacetimeDB from '../generated';
import { DbConnection } from '../generated';

type SubscriptionHandle = { unsubscribe: () => void } | null;

export interface UISubscriptionStates {
    messages: Map<string, SpacetimeDB.Message>;
    playerPins: Map<string, SpacetimeDB.PlayerPin>;
    activeConnections: Map<string, SpacetimeDB.ActiveConnection>;
    matronages: Map<string, any>;
    matronageMembers: Map<string, any>;
    matronageInvitations: Map<string, any>;
    matronageOwedShards: Map<string, any>;
    tutorialQuestDefinitions: Map<string, SpacetimeDB.TutorialQuestDefinition>;
    dailyQuestDefinitions: Map<string, SpacetimeDB.DailyQuestDefinition>;
    playerTutorialProgress: Map<string, SpacetimeDB.PlayerTutorialProgress>;
    playerDailyQuests: Map<string, SpacetimeDB.PlayerDailyQuest>;
    questCompletionNotifications: Map<string, SpacetimeDB.QuestCompletionNotification>;
    questProgressNotifications: Map<string, SpacetimeDB.QuestProgressNotification>;
    sovaQuestMessages: Map<string, SpacetimeDB.SovaQuestMessage>;
    beaconDropEvents: Map<string, SpacetimeDB.BeaconDropEvent>;
}

export const useUISubscriptions = (connection: DbConnection | null): UISubscriptionStates => {
    const [messages, setMessages] = useState<Map<string, SpacetimeDB.Message>>(() => new Map());
    const [playerPins, setPlayerPins] = useState<Map<string, SpacetimeDB.PlayerPin>>(() => new Map());
    const [activeConnections, setActiveConnections] = useState<Map<string, SpacetimeDB.ActiveConnection>>(() => new Map());

    const [matronages, setMatronages] = useState<Map<string, any>>(() => new Map());
    const [matronageMembers, setMatronageMembers] = useState<Map<string, any>>(() => new Map());
    const [matronageInvitations, setMatronageInvitations] = useState<Map<string, any>>(() => new Map());
    const [matronageOwedShards, setMatronageOwedShards] = useState<Map<string, any>>(() => new Map());

    const [tutorialQuestDefinitions, setTutorialQuestDefinitions] = useState<Map<string, SpacetimeDB.TutorialQuestDefinition>>(() => new Map());
    const [dailyQuestDefinitions, setDailyQuestDefinitions] = useState<Map<string, SpacetimeDB.DailyQuestDefinition>>(() => new Map());
    const [playerTutorialProgress, setPlayerTutorialProgress] = useState<Map<string, SpacetimeDB.PlayerTutorialProgress>>(() => new Map());
    const [playerDailyQuests, setPlayerDailyQuests] = useState<Map<string, SpacetimeDB.PlayerDailyQuest>>(() => new Map());
    const [questCompletionNotifications, setQuestCompletionNotifications] = useState<Map<string, SpacetimeDB.QuestCompletionNotification>>(() => new Map());
    const [questProgressNotifications, setQuestProgressNotifications] = useState<Map<string, SpacetimeDB.QuestProgressNotification>>(() => new Map());
    const [sovaQuestMessages, setSovaQuestMessages] = useState<Map<string, SpacetimeDB.SovaQuestMessage>>(() => new Map());
    const [beaconDropEvents, setBeaconDropEvents] = useState<Map<string, SpacetimeDB.BeaconDropEvent>>(() => new Map());

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
            onInsert: (ctx: any, msg: SpacetimeDB.Message) => setMessages(prev => new Map(prev).set(msg.id.toString(), msg)),
            onUpdate: (ctx: any, oldMsg: SpacetimeDB.Message, newMsg: SpacetimeDB.Message) => setMessages(prev => new Map(prev).set(newMsg.id.toString(), newMsg)),
            onDelete: (ctx: any, msg: SpacetimeDB.Message) => setMessages(prev => { const next = new Map(prev); next.delete(msg.id.toString()); return next; }),
        });

        registerTableCallbacks(connection.db.playerPin, {
            onInsert: (ctx: any, pin: SpacetimeDB.PlayerPin) => setPlayerPins(prev => new Map(prev).set(pin.playerId.toHexString(), pin)),
            onUpdate: (ctx: any, oldPin: SpacetimeDB.PlayerPin, newPin: SpacetimeDB.PlayerPin) => setPlayerPins(prev => new Map(prev).set(newPin.playerId.toHexString(), newPin)),
            onDelete: (ctx: any, pin: SpacetimeDB.PlayerPin) => setPlayerPins(prev => { const next = new Map(prev); next.delete(pin.playerId.toHexString()); return next; }),
        });

        registerTableCallbacks(connection.db.activeConnection, {
            onInsert: (ctx: any, conn: SpacetimeDB.ActiveConnection) => setActiveConnections(prev => new Map(prev).set(conn.identity.toHexString(), conn)),
            onDelete: (ctx: any, conn: SpacetimeDB.ActiveConnection) => setActiveConnections(prev => { const next = new Map(prev); next.delete(conn.identity.toHexString()); return next; }),
        });

        registerTableCallbacks(connection.db.matronage, {
            onInsert: (ctx: any, matronage: any) => setMatronages(prev => new Map(prev).set(matronage.id.toString(), matronage)),
            onUpdate: (ctx: any, oldMatronage: any, newMatronage: any) => setMatronages(prev => new Map(prev).set(newMatronage.id.toString(), newMatronage)),
            onDelete: (ctx: any, matronage: any) => setMatronages(prev => { const next = new Map(prev); next.delete(matronage.id.toString()); return next; }),
        });

        registerTableCallbacks(connection.db.matronageMember, {
            onInsert: (ctx: any, member: any) => setMatronageMembers(prev => new Map(prev).set(member.playerId.toHexString(), member)),
            onUpdate: (ctx: any, oldMember: any, newMember: any) => setMatronageMembers(prev => new Map(prev).set(newMember.playerId.toHexString(), newMember)),
            onDelete: (ctx: any, member: any) => setMatronageMembers(prev => { const next = new Map(prev); next.delete(member.playerId.toHexString()); return next; }),
        });

        registerTableCallbacks(connection.db.matronageInvitation, {
            onInsert: (ctx: any, invitation: any) => setMatronageInvitations(prev => new Map(prev).set(invitation.id.toString(), invitation)),
            onUpdate: (ctx: any, oldInvitation: any, newInvitation: any) => setMatronageInvitations(prev => new Map(prev).set(newInvitation.id.toString(), newInvitation)),
            onDelete: (ctx: any, invitation: any) => setMatronageInvitations(prev => { const next = new Map(prev); next.delete(invitation.id.toString()); return next; }),
        });

        registerTableCallbacks(connection.db.matronageOwedShards, {
            onInsert: (ctx: any, owed: any) => setMatronageOwedShards(prev => new Map(prev).set(owed.playerId.toHexString(), owed)),
            onUpdate: (ctx: any, oldOwed: any, newOwed: any) => setMatronageOwedShards(prev => new Map(prev).set(newOwed.playerId.toHexString(), newOwed)),
            onDelete: (ctx: any, owed: any) => setMatronageOwedShards(prev => { const next = new Map(prev); next.delete(owed.playerId.toHexString()); return next; }),
        });

        registerTableCallbacks(connection.db.tutorialQuestDefinition, {
            onInsert: (ctx: any, def: SpacetimeDB.TutorialQuestDefinition) => setTutorialQuestDefinitions(prev => new Map(prev).set(def.id, def)),
            onUpdate: (ctx: any, oldDef: SpacetimeDB.TutorialQuestDefinition, newDef: SpacetimeDB.TutorialQuestDefinition) => setTutorialQuestDefinitions(prev => new Map(prev).set(newDef.id, newDef)),
            onDelete: (ctx: any, def: SpacetimeDB.TutorialQuestDefinition) => setTutorialQuestDefinitions(prev => { const next = new Map(prev); next.delete(def.id); return next; }),
        });

        registerTableCallbacks(connection.db.dailyQuestDefinition, {
            onInsert: (ctx: any, def: SpacetimeDB.DailyQuestDefinition) => setDailyQuestDefinitions(prev => new Map(prev).set(def.id, def)),
            onUpdate: (ctx: any, oldDef: SpacetimeDB.DailyQuestDefinition, newDef: SpacetimeDB.DailyQuestDefinition) => setDailyQuestDefinitions(prev => new Map(prev).set(newDef.id, newDef)),
            onDelete: (ctx: any, def: SpacetimeDB.DailyQuestDefinition) => setDailyQuestDefinitions(prev => { const next = new Map(prev); next.delete(def.id); return next; }),
        });

        registerTableCallbacks(connection.db.playerTutorialProgress, {
            onInsert: (ctx: any, progress: SpacetimeDB.PlayerTutorialProgress) => {
                if (connection.identity && progress.playerId.toHexString() === connection.identity.toHexString()) {
                    setPlayerTutorialProgress(prev => new Map(prev).set(progress.playerId.toHexString(), progress));
                }
            },
            onUpdate: (ctx: any, oldProgress: SpacetimeDB.PlayerTutorialProgress, newProgress: SpacetimeDB.PlayerTutorialProgress) => {
                if (connection.identity && newProgress.playerId.toHexString() === connection.identity.toHexString()) {
                    setPlayerTutorialProgress(prev => new Map(prev).set(newProgress.playerId.toHexString(), newProgress));
                }
            },
            onDelete: (ctx: any, progress: SpacetimeDB.PlayerTutorialProgress) => {
                if (connection.identity && progress.playerId.toHexString() === connection.identity.toHexString()) {
                    setPlayerTutorialProgress(prev => { const next = new Map(prev); next.delete(progress.playerId.toHexString()); return next; });
                }
            },
        });

        registerTableCallbacks(connection.db.playerDailyQuest, {
            onInsert: (ctx: any, quest: SpacetimeDB.PlayerDailyQuest) => {
                if (connection.identity && quest.playerId.toHexString() === connection.identity.toHexString()) {
                    setPlayerDailyQuests(prev => new Map(prev).set(quest.id.toString(), quest));
                }
            },
            onUpdate: (ctx: any, oldQuest: SpacetimeDB.PlayerDailyQuest, newQuest: SpacetimeDB.PlayerDailyQuest) => {
                if (connection.identity && newQuest.playerId.toHexString() === connection.identity.toHexString()) {
                    setPlayerDailyQuests(prev => new Map(prev).set(newQuest.id.toString(), newQuest));
                }
            },
            onDelete: (ctx: any, quest: SpacetimeDB.PlayerDailyQuest) => {
                if (connection.identity && quest.playerId.toHexString() === connection.identity.toHexString()) {
                    setPlayerDailyQuests(prev => { const next = new Map(prev); next.delete(quest.id.toString()); return next; });
                }
            },
        });

        registerTableCallbacks(connection.db.questCompletionNotification, {
            onInsert: (ctx: any, notif: SpacetimeDB.QuestCompletionNotification) => {
                if (connection.identity && notif.playerId.toHexString() === connection.identity.toHexString()) {
                    setQuestCompletionNotifications(prev => new Map(prev).set(notif.id.toString(), notif));
                }
            },
            onDelete: (ctx: any, notif: SpacetimeDB.QuestCompletionNotification) => {
                if (connection.identity && notif.playerId.toHexString() === connection.identity.toHexString()) {
                    setQuestCompletionNotifications(prev => { const next = new Map(prev); next.delete(notif.id.toString()); return next; });
                }
            },
        });

        registerTableCallbacks(connection.db.questProgressNotification, {
            onInsert: (ctx: any, notif: SpacetimeDB.QuestProgressNotification) => {
                if (connection.identity && notif.playerId.toHexString() === connection.identity.toHexString()) {
                    setQuestProgressNotifications(prev => new Map(prev).set(notif.id.toString(), notif));
                }
            },
            onDelete: (ctx: any, notif: SpacetimeDB.QuestProgressNotification) => {
                if (connection.identity && notif.playerId.toHexString() === connection.identity.toHexString()) {
                    setQuestProgressNotifications(prev => { const next = new Map(prev); next.delete(notif.id.toString()); return next; });
                }
            },
        });

        registerTableCallbacks(connection.db.sovaQuestMessage, {
            onInsert: (ctx: any, msg: SpacetimeDB.SovaQuestMessage) => {
                if (connection.identity && msg.playerId.toHexString() === connection.identity.toHexString()) {
                    setSovaQuestMessages(prev => new Map(prev).set(msg.id.toString(), msg));
                }
            },
            onDelete: (ctx: any, msg: SpacetimeDB.SovaQuestMessage) => {
                if (connection.identity && msg.playerId.toHexString() === connection.identity.toHexString()) {
                    setSovaQuestMessages(prev => { const next = new Map(prev); next.delete(msg.id.toString()); return next; });
                }
            },
        });

        registerTableCallbacks(connection.db.beaconDropEvent, {
            onInsert: (ctx: any, event: SpacetimeDB.BeaconDropEvent) => setBeaconDropEvents(prev => new Map(prev).set(event.id.toString(), event)),
            onUpdate: (ctx: any, oldEvent: SpacetimeDB.BeaconDropEvent, newEvent: SpacetimeDB.BeaconDropEvent) => setBeaconDropEvents(prev => new Map(prev).set(newEvent.id.toString(), newEvent)),
            onDelete: (ctx: any, event: SpacetimeDB.BeaconDropEvent) => setBeaconDropEvents(prev => { const next = new Map(prev); next.delete(event.id.toString()); return next; }),
        });

        const nonSpatialQueries = [
            'SELECT * FROM message',
            'SELECT * FROM player_pin',
            'SELECT * FROM active_connection',
            'SELECT * FROM matronage',
            'SELECT * FROM matronage_member',
            'SELECT * FROM matronage_invitation',
            'SELECT * FROM matronage_owed_shards',
            'SELECT * FROM tutorial_quest_definition',
            'SELECT * FROM daily_quest_definition',
            'SELECT * FROM player_tutorial_progress',
            'SELECT * FROM player_daily_quest',
            'SELECT * FROM quest_completion_notification',
            'SELECT * FROM quest_progress_notification',
            'SELECT * FROM sova_quest_message',
            'SELECT * FROM beacon_drop_event',
        ];

        subsRef.current = nonSpatialQueries.map((query) =>
            connection.subscriptionBuilder()
                .onError((err) => console.error('[useUISubscriptions] Subscription error:', query, err))
                .subscribe(query)
        );

        return () => {
            subsRef.current.forEach((sub) => sub?.unsubscribe());
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
