# APP C: BILLING CLIENT APP (Local Terminal)

## 1. Overview
This is a lightweight application installed on secondary computers (the checkout counters). It contains NO business logic and NO local database. It is a "dumb client" that securely connects to App B (The Main Local App).

## 2. Technical Stack
*   **Shell**: Electron.
*   **Frontend**: React + Vite (Cashier UI: Fast Billing, Barcode Scanning, Receipt Printing).
*   **Backend**: NONE. It only makes HTTP REST calls using `axios` or `fetch`.

## 3. Core Responsibilities
1.  **Discovery/Connection**: Locates and connects to the Main System on the Local Area Network (LAN).
2.  **Hardware Handshake**: Provides its MAC address to the Main System to request a "terminal slot" from the local license pool.
3.  **High-Speed UX**: Optimized for barcode scanning and fast keyboard navigation.
4.  **Hardware Interfacing**: Communicates with receipt printers and cash drawers via Electron's hardware APIs.

## 4. First-Launch Setup Sequence
1.  **Launch**: App opens to a "Network Setup" screen.
2.  **Identify Server**: User types the IP address of the Main System (e.g., `192.168.1.100`) and the port (e.g., `5000`).
3.  **Extract Hardware ID**: Electron's Node.js integration extracts the `mac_address` of this specific billing computer.
4.  **Handshake Request**: App makes a `POST http://192.168.1.100:5000/api/v1/system/pair-client` with payload `{ mac_address: "XX:XX:XX:XX:XX:XX", friendly_name: "Counter 2" }`.
5.  **Main App Response**: 
    *   If Main App (App B) says "License Limit Reached", App C shows an error.
    *   If Main App says "Approved", App C locally saves the `Main_System_IP` into simple persistent storage (like `localStorage` or `electron-store`).
6.  **Redirect to Login**: App C re-routes to the standard User Login screen, authenticating against the Main App's database.

## 5. Resiliency & Offline Handling
Because App C relies entirely on App B via Wi-Fi/Ethernet:
*   App C must implement aggressive **retry logic** if a network request fails (e.g., Wi-Fi drops for 2 seconds during a save).
*   If the connection is fully lost, App C must show a persistent "DISCONNECTED FROM MAIN SERVER" banner overlay blocking new invoices until reconnected to prevent data loss.
