// markup for the about screen
export default `
      <div class="page">
        <div class="card">
          <h2>Connect</h2>
          <p><b>On the PM5:</b> More Options → Turn Wireless ON. Connect from here <em>before</em> starting a workout, then row — Just Row or any programmed piece.</p>
          <p><b>iPhone:</b> Safari has no Bluetooth for web pages; open this link in the free <b>Bluefy</b> browser. <b>Android, Mac, Windows, ChromeOS:</b> Chrome or Edge.</p>
          <p><b>While rowing:</b> tap anywhere on the display (or <em>Display</em>) to cycle Metrics → Power → Force → Pace → Stroke map. <em>Units</em> switches the big number between pace, watts and cal/hr. On a TV or wide screen everything shows at once — AirPlay your phone, or set Layout to <em>Dashboard</em>. Keyboard: ← → and U.</p>
          <div class="row"><button class="btn primary" id="demoBtn">Try demo</button></div>
        </div>
        <div class="card">
          <h2>Your data</h2>
          <p>Sessions stay on this device (IndexedDB) — nothing is uploaded. Each saved session opens a full analysis in History and exports as JSON: one record per stroke with its force curve, plus the pace / rate / heart-rate time series.</p>
        </div>
        <div class="card"><h2>Device</h2><table id="devTable"><tr><td>Status</td><td>not connected</td></tr></table></div>
        <p style="color:var(--muted);font-size:0.8rem;text-align:center;margin-top:16px">Flywheel <span id="appVer"></span> · charts by Plotly.js, 3D by three.js (MIT) · type: IBM Plex (OFL) · not affiliated with Concept2</p>
        <p id="diag" style="color:var(--muted);font-size:0.7rem;font-family:var(--mono);text-align:center;margin-top:6px;word-break:break-word"></p>
      </div>
`;
