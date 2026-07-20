const baseUrl = process.argv[2] || "http://localhost:3000";
const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/health`);
const data = await response.json();
console.log(data);
if (!response.ok || !data.ok || !data.supabaseConfigured) process.exit(1);
console.log("배포 상태가 정상입니다.");
