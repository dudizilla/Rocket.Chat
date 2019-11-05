import { Mongo } from 'meteor/mongo';
import mitt from 'mitt';
import React, { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, useMemo } from 'react';
import { Tracker } from 'meteor/tracker';

import { PrivateSettingsCachedCollection } from '../../../../app/ui-admin/client/SettingsCachedCollection';

const SettingsContext = createContext({});

let privateSettingsCachedCollection; // Remove this singleton (╯°□°)╯︵ ┻━┻

const compareStrings = (a = '', b = '') => {
	if (a === b || (!a && !b)) {
		return 0;
	}

	return a > b ? 1 : -1;
};

const compareSettings = (a, b) =>
	compareStrings(a.section, b.section)
	|| compareStrings(a.sorter, b.sorter)
	|| compareStrings(a.i18nLabel, b.i18nLabel);

const stateReducer = (state, { type, payload }) => {
	switch (type) {
		case 'add':
			return [...state, ...payload].sort(compareSettings);

		case 'change':
			return state.map((setting) => (setting._id !== payload._id ? setting : payload));

		case 'remove':
			return state.filter((setting) => setting._id !== payload);

		case 'hydrate': {
			const map = {};
			payload.forEach((setting) => {
				map[setting._id] = setting;
			});

			return state.map((setting) => (map[setting._id] ? { ...setting, ...map[setting._id] } : setting));
		}
	}

	return state;
};

const useStateRef = (value) => {
	const ref = useRef(value);
	ref.current = value;
	return ref;
};

export function SettingsState({ children }) {
	const [isLoading, setLoading] = useState(true);

	const stopLoading = () => {
		setLoading(false);
	};


	const persistedCollectionRef = useRef();
	useEffect(() => {
		if (!privateSettingsCachedCollection) {
			privateSettingsCachedCollection = new PrivateSettingsCachedCollection();
			privateSettingsCachedCollection.init().then(stopLoading, stopLoading);
		}

		persistedCollectionRef.current = privateSettingsCachedCollection.collection;
	}, []);


	const [collection] = useState(() => new Mongo.Collection(null));
	const collectionRef = useStateRef(collection);


	const [persistedState, updatePersistedState] = useReducer(stateReducer, []);
	const persistedStateRef = useStateRef(persistedState);

	const [stateEmitter] = useState(() => mitt());

	const isDisabled = useCallback(({ blocked, enableQuery }) => {
		if (blocked) {
			return true;
		}

		if (!enableQuery) {
			return false;
		}

		const { current: collection } = collectionRef;

		const queries = [].concat(typeof enableQuery === 'string' ? JSON.parse(enableQuery) : enableQuery);
		return !queries.every((query) => !!collection.findOne(query));
	}, []);

	const enhancedReducer = useCallback((state, action) => {
		const newState = stateReducer(state, action);

		if (action.type === 'hydrate') {
			action.payload.forEach(({ _id }) => {
				const setting = newState.find((setting) => setting._id === _id);
				const persistedSetting = persistedStateRef.current.find((setting) => setting._id === _id);
				const disabled = Tracker.nonreactive(() => isDisabled(setting));
				stateEmitter.emit(_id, { setting, persistedSetting, disabled });
			});
		}

		return newState;
	}, [persistedStateRef]);

	const [state, updateState] = useReducer(enhancedReducer, []);
	const stateRef = useStateRef(state);

	const updateStates = (action) => {
		updatePersistedState(action);
		updateState(action);
	};

	useEffect(() => {
		if (isLoading) {
			return;
		}

		const addedQueue = [];
		let addedActionTimer;

		const added = (data) => {
			collection.insert(data);
			addedQueue.push(data);
			clearTimeout(addedActionTimer);
			addedActionTimer = setTimeout(() => {
				updateStates({ type: 'add', payload: addedQueue });
			}, 70);
		};

		const changed = (data) => {
			collection.update(data._id, data);
			updateStates({ type: 'change', payload: data });
		};

		const removed = ({ _id }) => {
			collection.remove(_id);
			updateStates({ type: 'remove', payload: _id });
		};

		const persistedFieldsQueryHandle = persistedCollectionRef.current.find()
			.observe({
				added,
				changed,
				removed,
			});

		return () => {
			persistedFieldsQueryHandle.stop();
			clearTimeout(addedActionTimer);
		};
	}, [isLoading]);

	const updateTimersRef = useRef({});

	const updateAtCollection = ({ _id, ...data }) => {
		const { current: updateTimers } = updateTimersRef;
		clearTimeout(updateTimers[_id]);
		updateTimers[_id] = setTimeout(() => {
			collection.update(_id, { $set: data });
		}, 70);
	};

	const updateAtCollectionRef = useRef();
	const updateStateRef = useRef();

	useEffect(() => {
		updateAtCollectionRef.current = updateAtCollection;
		updateStateRef.current = updateState;
	});

	const hydrate = useCallback((changes) => {
		const { current: updateAtCollection } = updateAtCollectionRef;
		const { current: updateState } = updateStateRef;
		changes.forEach(updateAtCollection);
		updateState({ type: 'hydrate', payload: changes });
	}, []);

	const group = useMemo(() => {

	}, [persistedState]);

	const contextValue = useMemo(() => ({
		isLoading,
		hydrate,
		isDisabled,
		stateRef,
		persistedStateRef,
		stateEmitter,
	}), [
		isLoading,
		hydrate,
		isDisabled,
		stateRef,
		persistedStateRef,
		stateEmitter,
	]);

	return <SettingsContext.Provider children={children} value={contextValue} />;
}

export const useSettingsState = () => useContext(SettingsContext);

export const useSettingState = (_id) => {
	const { stateRef, persistedStateRef, stateEmitter, hydrate } = useContext(SettingsContext);
	const [state, setState] = useState(() => ({
		setting: stateRef.current.find((setting) => setting._id === _id),
		persistedSetting: persistedStateRef.current.find((setting) => setting._id === _id),
		disabled: false,
	}));

	useEffect(() => {
		stateEmitter.on(_id, setState);

		return () => {
			stateEmitter.off(_id, setState);
		};
	}, [_id]);

	return { ...state, hydrate };
};
