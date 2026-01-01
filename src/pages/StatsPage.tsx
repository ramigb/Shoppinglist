import { useEffect, useState } from "react";
import { listService } from "@/lib/db";
import { ShoppingList } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";
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

  if (loading) return <div>Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Statistics & Backup</h1>
        <div className="flex gap-2">
            <Button variant="outline" onClick={handleDownloadBackup}>
                <Download className="mr-2 h-4 w-4" /> Export Backup
            </Button>
            <div className="relative">
                <Button variant="outline" className="cursor-pointer" asChild>
                    <label>
                        <Upload className="mr-2 h-4 w-4" /> Import Backup
                        <input type="file" className="hidden" accept=".json" onChange={handleUploadBackup} />
                    </label>
                </Button>
            </div>
        </div>
      </div>

      {!stats ? (
        <Card>
            <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">No purchase history available yet.</p>
            </CardContent>
        </Card>
      ) : (
        <>
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Items Purchased</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.totalPurchases}</div>
                </CardContent>
                </Card>
                <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Most Purchased</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.mostPurchased?.name}</div>
                    <p className="text-xs text-muted-foreground">{stats.mostPurchased?.count} times</p>
                </CardContent>
                </Card>
                <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Least Purchased</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.leastPurchased?.name}</div>
                    <p className="text-xs text-muted-foreground">{stats.leastPurchased?.count} times</p>
                </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Purchase History (Top 10)</CardTitle>
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
