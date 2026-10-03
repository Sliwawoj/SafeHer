import { FakeCallApp } from "./src/FakeCallScreen";
import { SettingsProvider } from "./src/settings/SettingsContext";

export default function App() {
  return (
    <SettingsProvider>
      <FakeCallApp />
    </SettingsProvider>
  );
}
