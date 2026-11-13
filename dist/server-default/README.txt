伺服器預設組的內建來源（檔名＝槽位 id，例如 prop/rock.glb）。建置時複製到 dist/server-default/，
伺服器啟動時自動匯入（server.js 的 seedDefaults）；這個資料夾要留著，來源拿掉的 GLB 才會從伺服器上移除。

2026-11-13：地圖物件的 GLB 先全部改用精緻的程式模型，原本的 13 個 GLB（Poly Haven／NASA 3D Resources，
來源見 CREDITS.txt）搬到 src/assets/server-default-off/prop/；要恢復時搬回這裡的 prop/。
