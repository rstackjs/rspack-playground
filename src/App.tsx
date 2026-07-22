import useEvent from "react-use/esm/useEvent";
import { Toaster } from "sonner";
import Editor from "@/components/Editor";
import Header from "@/components/Header";
import { ThemeProvider } from "@/components/ThemeProvider";

const App = () => {
  useEvent(
    "keydown",
    (event: KeyboardEvent) => {
      const isSaveKey = event.code === "KeyS" || event.key.toLowerCase() === "s";
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && isSaveKey) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    undefined,
    { capture: true },
  );

  return (
    <ThemeProvider defaultTheme="system">
      <div className="relative h-screen flex flex-col">
        <Header />
        <main className="flex-1 overflow-hidden">
          <Editor />
        </main>
      </div>
      <Toaster />
    </ThemeProvider>
  );
};

export default App;
