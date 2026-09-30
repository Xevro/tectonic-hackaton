import { ProfilePicker } from "@/components/profile-picker";
import { TopBar } from "@/components/top-bar";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <>
      <TopBar />
      <ProfilePicker />
    </>
  );
}
