import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';

import { useSettingState } from './SettingsState';

const SettingContext = createContext({});

const useStateRef = (value) => {
	const ref = useRef(value);
	ref.current = value;
	return ref;
};

export function SettingState({ children, setting: _id }) {
	const { setting, persistedSetting, disabled, hydrate } = useSettingState(_id);
	const settingRef = useStateRef(setting);
	const persistedSettingRef = useStateRef(persistedSetting);

	const update = useCallback((data) => {
		const setting = { ...settingRef.current, ...data };
		const { current: persistedSetting } = persistedSettingRef;

		const changes = [{
			_id: setting._id,
			value: setting.value,
			editor: setting.editor,
			changed: (setting.value !== persistedSetting.value) || (setting.editor !== persistedSetting.editor),
		}];

		hydrate(changes);
	}, []);

	const reset = useCallback(() => {
		const { current: persistedSetting } = persistedSettingRef;

		const { _id, value, packageValue, editor } = persistedSetting;
		const changes = [{
			_id,
			value: packageValue,
			editor,
			changed: packageValue !== value,
		}];

		hydrate(changes);
	}, []);

	const contextValue = useMemo(() => ({
		...setting,
		disabled,
		update,
		reset,
	}), [setting, disabled]);

	return <SettingContext.Provider children={children} value={contextValue} />;
}

export const useSetting = () => useContext(SettingContext);
