using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace DogEar.Desktop;

static class Program
{
    // Books and notes live here (WebView2 profile: IndexedDB, settings). Survives restarts and app updates;
    // removed only if the user deletes the folder.
    static readonly string DataDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DogEar");

    // The web files are served from this made-up https origin (".example" is reserved, never a real site).
    // It must never change: IndexedDB is tied to the origin, so a new name would hide every saved book & note.
    const string Host = "dogear.example";

    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();

        var form = new Form
        {
            Text = "Dog-Ear",
            Width = 1280,
            Height = 860,
            StartPosition = FormStartPosition.CenterScreen,
            BackColor = System.Drawing.Color.FromArgb(42, 37, 32),
            Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath),
        };
        var web = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = form.BackColor };
        form.Controls.Add(web);

        form.Load += async (_, _) =>
        {
            try
            {
                var env = await CoreWebView2Environment.CreateAsync(null, DataDir);
                await web.EnsureCoreWebView2Async(env);
            }
            catch (WebView2RuntimeNotFoundException)
            {
                MessageBox.Show(form,
                    "Dog-Ear needs the Microsoft Edge WebView2 Runtime, which is missing on this PC.\n\n" +
                    "Install it from https://go.microsoft.com/fwlink/p/?LinkId=2124703 and start Dog-Ear again.",
                    "Dog-Ear", MessageBoxButtons.OK, MessageBoxIcon.Error);
                form.Close();
                return;
            }

            var core = web.CoreWebView2;
            core.SetVirtualHostNameToFolderMapping(Host, Path.Combine(AppContext.BaseDirectory, "web"),
                CoreWebView2HostResourceAccessKind.DenyCors);
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.DocumentTitleChanged += (_, _) => form.Text = core.DocumentTitle;
            core.Navigate($"https://{Host}/index.html");
        };

        Application.Run(form);
    }
}
