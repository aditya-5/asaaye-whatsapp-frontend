# Asaaye WhatsApp Frontend - Deployment & Configuration

This project contains the React + Vite frontend dashboard for the WhatsApp CRM system.

## 🔗 Live URLs & Services
* **Live Site (Vercel)**: [https://asaaye-whatsapp.vercel.app/](https://asaaye-whatsapp.vercel.app/)
* **Vercel Project Settings**: [https://vercel.com/adityas-projects-2126193f/asaaye-whatsapp/settings/general](https://vercel.com/adityas-projects-2126193f/asaaye-whatsapp/settings/general)

---

## 🛠️ Deployment Workflow
The frontend is deployed to **Vercel** using the Vercel CLI. It is *not* auto-deployed on git push.

### Deployment Commands:
To publish your updates live to Vercel:
1. Open your terminal in the frontend directory:
   ```bash
   cd dashboard/frontend
   ```
2. Deploy directly to production:
   ```bash
   npx vercel --prod
   ```

---

## 💾 Version Control Backup
The frontend code is backed up at: `https://github.com/aditya-5/asaaye-whatsapp-frontend.git`

To push your latest changes to GitHub for backup:
```bash
git add .
git commit -m "Update frontend code"
git push origin main
```
*(Note: Pushing to GitHub keeps your version history safe, but does not affect the live Vercel site. Use `npx vercel --prod` to deploy.)*
