import "./App.css";
import GautengCreativeDashboard from "./components/GautengCreativeDashboard";
import points from "./data/dataset";

// 1) Exact category → color mapping (keys must match your dataset strings)
const catColors = {
  "Industry association or network": "#AAEFC5",
  "Collective management organisation (CMO)": "#FB7185",
  "Incubator or creative hub": "#FA2692",
  "Cultural and natural heritage site": "#B8525C",
  "Private initiative": "#FF7F50",
  "Maker Space": "#4B6895",
  "4IR Library": "#7F24B8",
  "Public-private partnership": "#F5D824",
  "Artist studio": "#EEFA3B",
  "Theatre": "#C2B8FA",
  "Government": "#0EA5A5",
  "Government SEZs": "#10B981",
  "Academic partnership": "#3B82F6",
  "International organisation": "#6366F1",
  "Corporate collection": "#F59E0B",
  "Commercial gallery": "#EC4899",
  "Non-profit": "#22C55E",

  // NEW split for events:
  "Festival": "#F97316",
  "Conference": "#8B5CF6",
  "Trade Fair / Market": "#14B8A6",
  // Optional specific event types
  "Book Fair": "#EF4444",
  "Art Fair": "#06B6D4",
};

// 2) Legend order (optional, but nice to keep things consistent)
const catOrder = Object.keys(catColors);

export default function App() {
  return (
    <div className="page">
      <main className="pageMain">
        <div>
          <GautengCreativeDashboard
            topoUrl="/gauteng_adm2.topo.json"
            points={points}
            leftTitle={"GAUTENG CREATIVE SECTOR\nSUPPORTIVE INFRASTRUCTURE"}
            leftIntro={
              <>
                Developed by{" "}
                <a
                  href="https://incca.org.za/Overview-Study-for-the-Creative-Industries-Sector-in-Gauteng"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  INCCA (Independent Network for Contemporary Culture & Art)
                </a>
                , this interactive map draws on research from the 2024 Inclusive
                Economies Programme, a collaboration between the Gauteng
                City-Region Observatory (GCRO) and the Gauteng Department of
                Economic Development. It visualises key mechanisms that support
                the creative industries sector Gauteng, South Africa’s most
                populous and economically vibrant province — from government
                entities, associations, incubators, and hubs to galleries,
                academic partnerships, and private initiatives. While not
                exhaustive, it highlights selected examples where innovative
                infrastructure and programming, based on our research, appear to
                be strengthening the Cultural and Creative Industries.
              </>
            }
            categoryColors={catColors}
            categoryOrder={[
              // Events first (split)
              "Festival", "Conference", "Trade Fair / Market", "Book Fair", "Art Fair",
              // Organisations / infra
              "Government", "Government SEZs", "Public-private partnership",
              "Industry association or network", "Collective management organisation (CMO)", "Incubator or creative hub",
              "Academic partnership", "International organisation",
              "Non-profit", "Private initiative",
              // Places / spaces
              "Commercial gallery", "Corporate collection", "Artist studio",
              "Maker Space", "4IR Library", "Theatre",
              "Cultural and natural heritage site",
            ]}
            dotRadius={4}
            dotOpacity={0.9}
          />
        </div>
      </main>

      <footer className="pageFooter">
        © {new Date().getFullYear()} Independent Network for Contemporary
        Culture & Art ·{" "}
        <a href="https://incca.org.za/Overview-Study-for-the-Creative-Industries-Sector-in-Gauteng">
          About
        </a>
      </footer>
    </div>
  );
}
