export const AdminPage = () => {
  return (
    <div
      style={{
        width: "100%",
        height: "calc(100vh - 60px)",
        overflow: "hidden",
      }}
    >
      <iframe
        src="/admin-login.html"
        title="Admin Login"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
        }}
      />
    </div>
  );
};

export const AdminDashboardPage = () => {
  return (
    <div
      style={{
        width: "100%",
        height: "calc(100vh - 60px)",
        overflow: "hidden",
      }}
    >
      <iframe
        src="/admin.html"
        title="Admin Login"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
        }}
      />
    </div>
  );
};

export const PartnerPage = () => {
  return (
    <div
      style={{
        width: "100%",
        height: "calc(100vh - 60px)",
        overflow: "hidden",
      }}
    >
      <iframe
        src="/partner-login.html"
        title="Partner Login"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
        }}
      />
    </div>
  );
};

export const PartnerDashboardPage = () => {
  return (
    <div
      style={{
        width: "100%",
        height: "calc(100vh - 60px)",
        overflow: "hidden",
      }}
    >
      <iframe
        src="/partner-console.html"
        title="Partner Login"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
        }}
      />
    </div>
  );
};
