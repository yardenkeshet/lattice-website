import {Button} from "@/components/ui/button";


const NavigationBar = () => {
  return (
    <nav className="bg-technion-blue border-b-4 border-white/10 shadow-lg">
        <ul className="flex flex-row">
          <Button variant="link"><li><a href="#home">Home</a></li></Button>
          <Button variant="link"><li><a href="#lab">Lab</a></li></Button>
          <Button variant="link"><li><a href="#contact">Contact</a></li></Button>
        </ul>
    </nav>
  );
};
export default NavigationBar;
