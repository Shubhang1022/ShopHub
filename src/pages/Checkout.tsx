import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

const checkoutSchema = z.object({
  address: z.string().min(10, "Address must be at least 10 characters"),
});

export default function Checkout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: cartItems } = useQuery({
    queryKey: ["cart", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("cart_items")
        .select(`
          *,
          products (*)
        `)
        .eq("user_id", user.id);
      return data || [];
    },
    enabled: !!user,
  });

  const totalAmount = cartItems?.reduce(
    (sum, item: any) => sum + item.products.price * item.quantity,
    0
  ) || 0;

  const placeOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = checkoutSchema.safeParse({ address });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    if (!cartItems || cartItems.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    setLoading(true);

    try {
      // Create order
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user!.id,
          total_amount: totalAmount,
          shipping_address: address,
          status: "pending",
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = cartItems.map((item: any) => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        price: item.products.price,
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // Clear cart
      await supabase.from("cart_items").delete().eq("user_id", user!.id);

      queryClient.invalidateQueries({ queryKey: ["cart"] });
      toast.success("Order placed successfully!");
      navigate("/orders");
    } catch (error: any) {
      toast.error(error.message || "Failed to place order");
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <p className="text-lg">Please sign in to checkout</p>
        <Button onClick={() => navigate("/auth")} className="mt-4">
          Sign In
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl animate-fade-in">
      <h1 className="text-4xl font-bold mb-8 bg-gradient-primary bg-clip-text text-transparent">
        Checkout
      </h1>

      <div className="grid gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Shipping Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={placeOrder} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="address">Shipping Address</Label>
                <Textarea
                  id="address"
                  placeholder="Enter your complete shipping address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                  rows={4}
                />
              </div>
              
              <Card className="bg-muted">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between">
                    <span>Items:</span>
                    <span>{cartItems?.length || 0}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span className="text-primary">${totalAmount.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? "Placing Order..." : "Place Order"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}