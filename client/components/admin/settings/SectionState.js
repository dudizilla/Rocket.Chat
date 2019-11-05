import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';

import { useSettingsState } from './SettingsState';
import { useGroup } from './GroupState';

const SectionContext = createContext({});

export function SectionState({ children, section: name }) {
	const { stateRef, persistedStateRef, hydrate } = useSettingsState();
	const { _id: groupId } = useGroup();

	name = name || '';

	const { current: state } = stateRef;

	const settings = state.filter(({ group, section }) => group === groupId
		&& ((!name && !section) || (name === section)));
	const changed = settings.some(({ changed }) => changed);
	const canReset = settings.some(({ value, packageValue }) => value !== packageValue);
	const settingsIds = settings.map(({ _id }) => _id);

	const settingsRef = useRef();

	useEffect(() => {
		settingsRef.current = settings;
	});

	const reset = useCallback(() => {
		const { current: settings } = settingsRef;
		const { current: persistedState } = persistedStateRef;

		const changes = settings.map((setting) => {
			const { _id, value, packageValue, editor } = persistedState.find(({ _id }) => _id === setting._id);
			return {
				_id,
				value: packageValue,
				editor,
				changed: packageValue !== value,
			};
		});

		hydrate(changes);
	}, []);

	const contextValue = useMemo(() => ({
		name,
		changed,
		canReset,
		settings: settingsIds,
		reset,
	}), [
		name,
		changed,
		canReset,
		settingsIds.join(','),
	]);

	return <SectionContext.Provider children={children} value={contextValue} />;
}

export const useSection = () => useContext(SectionContext);
