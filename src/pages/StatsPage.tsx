import { useEffect, useState } from "react";
import { listService } from "@/lib/db";
import { ShoppingList } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download, PackageCheck, Sparkles, TrendingUp, Upload } from "lucide-react";
import { format } from "date-fns";

export default function StatsPage() {
  const [stats, setStats] = useState<{
      totalPurchases: number;
      mostPurchased: { name: string, count: number } | null;
      leastPurchased: { name: string, count: number } | null;
      history: { name: string, count: number, lastDate: string }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const calculateStats = async () => {
    try {
      const lists: ShoppingList[] = await listService.getAll();
      const itemStats: Record<string, { count: number, lastDate: string }> = {};
      let totalPurchases = 0;

      lists.forEach(list => {
        list.items.forEach(item => {
          if (item.done && item.doneDate) {
            const name = item.text.trim();
            if (!itemStats[name]) {
              itemStats[name] = { count: 0, lastDate: item.doneDate };
            }
            itemStats[name].count++;
            if (new Date(item.doneDate) > new Date(itemStats[name].lastDate)) {
              itemStats[name].lastDate = item.doneDate;
            }
            totalPurchases++;
          }
        });
      });

      const sortedItems = Object.entries(itemStats)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count);

      if (sortedItems.length === 0) {
        setStats(null);
      } else {
        setStats({
          totalPurchases,
          mostPurchased: sortedItems[0],
          leastPurchased: sortedItems[sortedItems.length - 1],
          history: sortedItems.slice(0, 10),
        });
      }
    } catch (e) {
      console.error("Error calculating stats", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    calculateStats();
  }, []);

  const handleDownloadBackup = async () => {
      const lists = await listService.getAll();
      const blob = new Blob([JSON.stringify({ lists }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shopping-list-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleUploadBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
          try {
              const text = event.target?.result as string;
              const data = JSON.parse(text);

              if (!data.lists || !Array.isArray(data.lists)) {
                  alert('Invalid backup file format.');
                  return;
              }

              if (confirm('This will overwrite your existing lists. Do you want to continue?')) {
                  await listService.clear();
                  for (const list of data.lists) {
                      await listService.save(list);
                  }
                  alert('Backup restored successfully.');
                  calculateStats(); // Refresh stats
              }
          } catch (err) {
              console.error(err);
              alert('Error parsing backup file.');
          } finally {
              e.target.value = '';
          }
      };
      reader.readAsText(file);
  };

  if (loading) return <div className="h-80 animate-pulse rounded-3xl bg-muted" aria-label="Loading insights" />;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Shopping insights</h1><p className="mt-2 text-muted-foreground">A simple view of what makes it into your basket.</p></div>
        <div className="flex gap-2">
            <Button variant="outline" onClick={handleDownloadBackup} className="flex-1 rounded-xl sm:flex-none">
                <Download className="size-4" /> Export
            </Button>
            <div className="relative">
                <Button variant="outline" className="cursor-pointer rounded-xl" asChild>
                    <label>
                        <Upload className="size-4" /> Import
                        <input type="file" className="hidden" accept=".json" onChange={handleUploadBackup} />
                    </label>
                </Button>
            </div>
        </div>
      </div>

      {!stats ? (
        <Card className="rounded-3xl border-dashed py-12">
            <CardContent className="text-center">
                <Sparkles className="mx-auto mb-4 size-8 text-primary" /><h2 className="font-bold">Insights start with your first check-off</h2><p className="mt-2 text-muted-foreground">Completed items will appear here automatically.</p>
            </CardContent>
        </Card>
      ) : (
        <>
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><PackageCheck className="size-4 text-primary" /> Items purchased</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.totalPurchases}</div>
                </CardContent>
                </Card>
                <Card className="rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><TrendingUp className="size-4 text-primary" /> Most purchased</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.mostPurchased?.name}</div>
                    <p className="text-xs text-muted-foreground">{stats.mostPurchased?.count} times</p>
                </CardContent>
                </Card>
                <Card className="rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Occasional pick</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.leastPurchased?.name}</div>
                    <p className="text-xs text-muted-foreground">{stats.leastPurchased?.count} times</p>
                </CardContent>
                </Card>
            </div>

            <Card className="overflow-hidden rounded-3xl">
                <CardHeader>
                    <CardTitle>Frequently purchased</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Item</TableHead>
                                <TableHead>Count</TableHead>
                                <TableHead>Last Purchased</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {stats.history.map((item) => (
                                <TableRow key={item.name}>
                                    <TableCell className="font-medium">{item.name}</TableCell>
                                    <TableCell>{item.count}</TableCell>
                                    <TableCell>{format(new Date(item.lastDate), 'MMM d, yyyy')}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </>
      )}
    </div>
  );
}
